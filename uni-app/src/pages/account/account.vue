<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useCodeToolsStore } from '@/stores/codeTools'
import { http } from '@/api/http'
import { buildPlatformApiPath } from '@/api/platformUserRouteContract'
import { createCompatActionRunner, type CompatEventLike } from '@/utils/h5EventCompat'
import { buildBackupExportQuery, type BackupExportFormState } from './backupExportParams'
import CodeToolsTaskStatusBadge from '@/components/code-tools/CodeToolsTaskStatusBadge.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'

const authStore = useAuthStore()
const codeToolsStore = useCodeToolsStore()
const runCompatAction = createCompatActionRunner()

onMounted(() => {
  void authStore.fetchUserInfo()
  void codeToolsStore.fetchList({ page: 0, size: 20 })
})

const backupForm = reactive<BackupExportFormState>({
  modulesText: 'conversations,messages',
  conversationLimitText: '',
  messageLimitText: '',
})

const backupQuery = computed(() => buildBackupExportQuery(backupForm))

const backupRunning = ref(false)
const backupError = ref('')
const backupMessage = ref('')
const backupSummary = ref<Record<string, string> | null>(null)
const backupPayloadText = ref('')
const changePasswordVisible = ref(false)

function normalizeBackupSummary(payload: unknown): Record<string, string> | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const meta = (record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : null) ?? {}
  const limits = meta.limits && typeof meta.limits === 'object' ? (meta.limits as Record<string, unknown>) : null

  const modulesRaw = record.modules
  const modules = Array.isArray(modulesRaw) ? modulesRaw.map((m) => String(m)) : []

  const result: Record<string, string> = {}
  if (record.kind != null) result.kind = String(record.kind)
  if (record.schemaVersion != null) result.schemaVersion = String(record.schemaVersion)
  if (record.exportedAt != null) result.exportedAt = String(record.exportedAt)
  if (modules.length) result.modules = modules.join(', ')

  if (meta.conversationCount != null) result.conversationCount = String(meta.conversationCount)
  if (meta.fileRefCount != null) result.fileRefCount = String(meta.fileRefCount)
  if (limits?.conversationLimit != null) result.conversationLimit = String(limits.conversationLimit)
  if (limits?.messageLimitPerConversation != null) {
    result.messageLimitPerConversation = String(limits.messageLimitPerConversation)
  }

  return Object.keys(result).length ? result : null
}

async function handleBackupExport() {
  backupRunning.value = true
  backupError.value = ''
  backupMessage.value = ''
  try {
    const path = buildPlatformApiPath('backup/export')
    const res = await http.get<Record<string, unknown>>(path, backupQuery.value, { auth: true, silent: false })
    const payload = res.data ?? null
    backupSummary.value = normalizeBackupSummary(payload)
    backupPayloadText.value = JSON.stringify(payload, null, 2)
    backupMessage.value = 'Export completed.'
  } catch (err) {
    backupError.value = err instanceof Error ? err.message : 'Export failed.'
  } finally {
    backupRunning.value = false
  }
}

async function handleBackupCopy() {
  if (!backupPayloadText.value) return
  backupError.value = ''
  backupMessage.value = ''
  try {
    await uni.setClipboardData({ data: backupPayloadText.value })
    backupMessage.value = 'Copied.'
  } catch (err) {
    backupError.value = err instanceof Error ? err.message : 'Copy failed.'
  }
}

function handleBackupClear() {
  backupError.value = ''
  backupMessage.value = ''
  backupSummary.value = null
  backupPayloadText.value = ''
}

const handleBackupExportActivate = (event?: CompatEventLike) => {
  runCompatAction('account-backup-export', event, () => {
    void handleBackupExport()
  })
}

const handleBackupCopyActivate = (event?: CompatEventLike) => {
  runCompatAction('account-backup-copy', event, () => {
    void handleBackupCopy()
  })
}

const handleBackupClearActivate = (event?: CompatEventLike) => {
  runCompatAction('account-backup-clear', event, () => {
    handleBackupClear()
  })
}

const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确认退出当前账号吗？',
    success: async (res) => {
      if (res.confirm) {
        await authStore.doLogout()
        uni.reLaunch({ url: '/pages/index/index' })
      }
    },
  })
}

const handleLogoutActivate = (event?: CompatEventLike) => {
  runCompatAction('account-logout', event, () => {
    handleLogout()
  })
}

function openChangePassword() {
  changePasswordVisible.value = true
}

const handleChangePasswordActivate = (event?: CompatEventLike) => {
  runCompatAction('account-change-password', event, () => {
    openChangePassword()
  })
}

const codeToolsForm = reactive({
  kind: 'shell',
  inputJsonText: '',
})

const codeToolsError = ref('')
const codeToolsMessage = ref('')
const selectedCodeToolsTaskId = ref('')

function parseOptionalJson(text: string): Record<string, unknown> | undefined {
  const trimmed = (text || '').trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Input JSON must be an object.')
  }
  return parsed as Record<string, unknown>
}

async function handleCreateCodeToolsTask() {
  codeToolsError.value = ''
  codeToolsMessage.value = ''
  try {
    const kind = codeToolsForm.kind.trim()
    if (!kind) throw new Error('kind is required.')
    const input = parseOptionalJson(codeToolsForm.inputJsonText)
    const task = await codeToolsStore.create({ kind, input })
    selectedCodeToolsTaskId.value = task.id
    codeToolsMessage.value = 'Task created.'
    if (task.id) {
      await codeToolsStore.fetchTask(task.id)
    }
  } catch (err) {
    codeToolsError.value = err instanceof Error ? err.message : String(err)
  }
}

const handleCreateCodeToolsTaskActivate = (event?: CompatEventLike) => {
  runCompatAction('account-codetools-create', event, () => {
    void handleCreateCodeToolsTask()
  })
}

async function handleOpenCodeToolsTask(id: string) {
  selectedCodeToolsTaskId.value = id
  codeToolsError.value = ''
  try {
    await codeToolsStore.fetchTask(id)
  } catch (err) {
    codeToolsError.value = err instanceof Error ? err.message : String(err)
  }
}

const handleOpenCodeToolsTaskActivate = (id: string, event?: CompatEventLike) => {
  runCompatAction(`account-codetools-open:${id}`, event, () => {
    void handleOpenCodeToolsTask(id)
  })
}

const handleRefreshCodeToolsActivate = (event?: CompatEventLike) => {
  runCompatAction('account-codetools-refresh', event, () => {
    void codeToolsStore.fetchList({ page: 0, size: 20 })
  })
}
</script>

<template>
  <AppLayout>
    <view class="p-4 max-w-2xl mx-auto">
      <view class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 flex items-center">
        <!-- Avatar -->
        <image 
          class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" 
          :src="authStore.userInfo?.avatar || '/static/default-avatar.png'"
        />
        <view class="ml-4 flex-1">
          <text class="text-xl font-bold text-gray-900 dark:text-gray-100 block">
            {{ authStore.userInfo?.phone || authStore.userInfo?.email || '未登录用户' }}
          </text>
          <text class="text-sm text-gray-500 block mt-1">{{ authStore.userInfo?.email || '未绑定邮箱' }}</text>
        </view>
        <view class="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs" v-if="authStore.userInfo">
          UID: {{ authStore.userInfo?.userId?.slice(0, 8) || '--' }}
        </view>
      </view>

      <view class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
        <view class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-medium text-gray-900 dark:text-gray-100">
          账号设置
        </view>
        <view
          class="flex justify-between items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer"
          @click="handleChangePasswordActivate"
          @tap="handleChangePasswordActivate"
        >
          <text class="text-gray-700 dark:text-gray-300">修改密码</text>
          <text class="text-gray-400 text-xl font-light">></text>
        </view>
        <view class="flex justify-between items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer">
          <text class="text-gray-700 dark:text-gray-300">清理缓存</text>
          <text class="text-gray-400 text-xl font-light">></text>
        </view>
      </view>

      <view class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
        <view class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-medium text-gray-900 dark:text-gray-100">
          Backup export
        </view>
        <view class="px-4 py-4">
          <view class="text-sm text-gray-600 dark:text-gray-300">
            Export your personal chat data as JSON. Keep it private.
          </view>

          <view class="mt-4 space-y-3">
            <view>
              <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Modules (comma-separated)</text>
              <input
                v-model="backupForm.modulesText"
                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                placeholder="conversations,messages,messageBlocks"
              />
              <text class="text-xs text-gray-500 dark:text-gray-400 block mt-1">
                Default backend modules apply when empty.
              </text>
            </view>

            <view class="flex gap-3">
              <view class="flex-1">
                <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Conversation limit (optional)</text>
                <input
                  v-model="backupForm.conversationLimitText"
                  type="number"
                  class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  placeholder="100"
                />
              </view>
              <view class="flex-1">
                <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">Message limit per conversation (optional)</text>
                <input
                  v-model="backupForm.messageLimitText"
                  type="number"
                  class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  placeholder="200"
                />
              </view>
            </view>
          </view>

          <view class="mt-4 flex gap-3">
            <button
              @click="handleBackupExportActivate"
              @tap="handleBackupExportActivate"
              class="flex-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium border-none"
              :disabled="backupRunning"
            >
              {{ backupRunning ? 'Exporting...' : 'Export' }}
            </button>
            <button
              @click="handleBackupCopyActivate"
              @tap="handleBackupCopyActivate"
              class="flex-1 bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-200 py-2 rounded-lg font-medium border-none"
              :disabled="!backupPayloadText"
            >
              Copy
            </button>
            <button
              @click="handleBackupClearActivate"
              @tap="handleBackupClearActivate"
              class="flex-1 bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-200 py-2 rounded-lg font-medium border-none"
              :disabled="backupRunning"
            >
              Clear
            </button>
          </view>

          <view v-if="backupError" class="mt-3 text-sm text-red-600 dark:text-red-400">
            {{ backupError }}
          </view>
          <view v-if="backupMessage" class="mt-3 text-sm text-green-600 dark:text-green-400">
            {{ backupMessage }}
          </view>

          <view
            v-if="backupSummary"
            class="mt-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-3"
          >
            <view class="grid grid-cols-1 gap-1">
              <view v-for="(value, key) in backupSummary" :key="key" class="flex justify-between gap-3 text-xs">
                <text class="text-gray-500 dark:text-gray-400">{{ key }}</text>
                <text class="text-gray-800 dark:text-gray-200 text-right">{{ value }}</text>
              </view>
            </view>
          </view>

          <textarea
            v-if="backupPayloadText"
            class="mt-4 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            :value="backupPayloadText"
            :maxlength="-1"
            auto-height
          />
        </view>
      </view>

      <view class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
        <view class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-medium text-gray-900 dark:text-gray-100">
          Code Tools
        </view>
        <view class="px-4 py-4">
          <view class="text-sm text-gray-600 dark:text-gray-300">
            Create a task, then wait for approval and review logs/artifacts.
          </view>

          <view class="mt-4 space-y-3">
            <view>
              <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">kind</text>
              <input
                v-model="codeToolsForm.kind"
                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                placeholder="shell"
              />
            </view>
            <view>
              <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">input (optional JSON object)</text>
              <textarea
                v-model="codeToolsForm.inputJsonText"
                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                :maxlength="-1"
                auto-height
                placeholder='{ "command": "echo hello" }'
              />
            </view>
          </view>

          <view class="mt-4 flex gap-3">
            <button
              @click="handleCreateCodeToolsTaskActivate"
              @tap="handleCreateCodeToolsTaskActivate"
              class="flex-1 bg-gray-900 text-white py-2 rounded-lg font-medium border-none"
              :disabled="codeToolsStore.loadingCreate"
            >
              {{ codeToolsStore.loadingCreate ? 'Creating...' : 'Create task' }}
            </button>
            <button
              @click="handleRefreshCodeToolsActivate"
              @tap="handleRefreshCodeToolsActivate"
              class="bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-200 py-2 px-4 rounded-lg font-medium border-none"
              :disabled="codeToolsStore.loadingList"
            >
              {{ codeToolsStore.loadingList ? 'Refreshing...' : 'Refresh' }}
            </button>
          </view>

          <view v-if="codeToolsError" class="mt-3 text-sm text-red-600 dark:text-red-400">
            {{ codeToolsError }}
          </view>
          <view v-if="codeToolsMessage" class="mt-3 text-sm text-green-600 dark:text-green-400">
            {{ codeToolsMessage }}
          </view>

          <view class="mt-5">
            <view class="text-sm font-medium text-gray-900 dark:text-gray-100">My tasks</view>

            <view v-if="codeToolsStore.loadingList && codeToolsStore.items.length === 0" class="mt-3 text-sm text-gray-500">
              Loading...
            </view>
            <view v-else-if="codeToolsStore.items.length === 0" class="mt-3 text-sm text-gray-500">
              No tasks yet.
            </view>

            <view v-else class="mt-3 space-y-3">
              <view
                v-for="item in codeToolsStore.items"
                :key="item.id"
                class="p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900/10"
                @click="handleOpenCodeToolsTaskActivate(item.id, $event)"
                @tap="handleOpenCodeToolsTaskActivate(item.id, $event)"
              >
                <view class="flex items-center justify-between gap-3">
                  <view class="min-w-0">
                    <text class="text-sm font-semibold text-gray-900 dark:text-gray-100 block truncate">{{ item.id }}</text>
                    <text class="text-xs text-gray-500 dark:text-gray-400 block mt-1">kind: {{ item.kind || '-' }}</text>
                    <text v-if="item.approval?.status" class="text-xs text-gray-500 dark:text-gray-400 block mt-1">
                      approval: {{ item.approval.status }}
                    </text>
                  </view>
                  <CodeToolsTaskStatusBadge :status="item.status" :approval-status="item.approval?.status" />
                </view>
              </view>
            </view>
          </view>

          <view v-if="selectedCodeToolsTaskId && codeToolsStore.current" class="mt-6">
            <view class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Task detail</view>

            <view class="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-3">
              <view class="flex items-center justify-between gap-3">
                <view class="min-w-0">
                  <text class="text-xs text-gray-500 dark:text-gray-400 block">id</text>
                  <text class="text-sm font-semibold text-gray-900 dark:text-gray-100 block truncate">{{ codeToolsStore.current.id }}</text>
                </view>
                <CodeToolsTaskStatusBadge
                  :status="codeToolsStore.current.status"
                  :approval-status="codeToolsStore.current.approval?.status"
                />
              </view>
              <view class="mt-2 text-xs text-gray-600 dark:text-gray-300">
                status: {{ codeToolsStore.current.status || '-' }}, approval: {{ codeToolsStore.current.approval?.status || '-' }}
              </view>
              <view v-if="codeToolsStore.current.inputJson" class="mt-3">
                <text class="text-xs text-gray-500 dark:text-gray-400 block mb-1">inputJson</text>
                <textarea
                  class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  :value="codeToolsStore.current.inputJson"
                  :maxlength="-1"
                  auto-height
                />
              </view>
            </view>

            <view class="mt-4">
              <view class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Logs</view>
              <view v-if="codeToolsStore.loadingCurrent" class="text-sm text-gray-500">Loading...</view>
              <view v-else-if="!codeToolsStore.currentLogs || codeToolsStore.currentLogs.length === 0" class="text-sm text-gray-500">
                No logs.
              </view>
              <view v-else class="space-y-2">
                <view
                  v-for="log in codeToolsStore.currentLogs"
                  :key="`${log.id || ''}-${log.createdAt || ''}`"
                  class="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900/10 p-3"
                >
                  <view class="flex items-center justify-between gap-3">
                    <text class="text-xs text-gray-500 dark:text-gray-400">{{ log.createdAt || '-' }}</text>
                    <text class="text-xs text-gray-500 dark:text-gray-400">{{ log.level || '-' }}</text>
                  </view>
                  <view class="mt-2 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{{ log.message || '' }}</view>
                </view>
              </view>
            </view>

            <view class="mt-4">
              <view class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Artifacts</view>
              <view v-if="codeToolsStore.loadingCurrent" class="text-sm text-gray-500">Loading...</view>
              <view
                v-else-if="!codeToolsStore.currentArtifacts || codeToolsStore.currentArtifacts.length === 0"
                class="text-sm text-gray-500"
              >
                No artifacts.
              </view>
              <view v-else class="space-y-2">
                <view
                  v-for="artifact in codeToolsStore.currentArtifacts"
                  :key="`${artifact.id || ''}-${artifact.createdAt || ''}`"
                  class="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900/10 p-3"
                >
                  <view class="flex items-center justify-between gap-3">
                    <text class="text-xs text-gray-500 dark:text-gray-400">{{ artifact.createdAt || '-' }}</text>
                    <text class="text-xs text-gray-500 dark:text-gray-400">{{ artifact.artifactType || '-' }}</text>
                  </view>
                  <view class="mt-2 text-sm text-gray-900 dark:text-gray-100">{{ artifact.name || '-' }}</view>
                  <view v-if="artifact.mime" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ artifact.mime }}</view>
                  <view v-if="artifact.contentUrl" class="mt-2 text-xs text-gray-500 dark:text-gray-400 break-all">
                    url: {{ artifact.contentUrl }}
                  </view>
                  <view v-if="artifact.contentText" class="mt-2">
                    <textarea
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      :value="artifact.contentText"
                      :maxlength="-1"
                      auto-height
                    />
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
        <view class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-medium text-gray-900 dark:text-gray-100">
          任务运行
        </view>
        <view class="px-4 py-4">
          <view class="text-sm text-gray-600 dark:text-gray-300">
            查看任务审批状态与执行记录。
          </view>
          <navigator
            url="/pages/agent-runs/index"
            class="mt-4 flex justify-between items-center px-4 py-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20"
          >
            <text class="text-gray-900 dark:text-gray-100 font-medium">打开任务列表</text>
            <text class="text-gray-400 text-xl font-light">></text>
          </navigator>
        </view>
      </view>

      <button 
        @click="handleLogoutActivate"
        @tap="handleLogoutActivate"
        class="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-3 rounded-xl font-medium border-none shadow-sm hover:bg-red-100 transition"
      >
        退出登录
      </button>
      <ChangePasswordDialog :visible="changePasswordVisible" @close="changePasswordVisible = false" />
    </view>
  </AppLayout>
</template>
