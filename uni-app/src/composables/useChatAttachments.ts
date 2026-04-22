import { ref, computed } from 'vue'
import type { ChatAttachment, ChatAttachmentKind } from '@/api/types/chat'
import type { AttachmentChipItem } from '@/components/attachments/AttachmentChip.vue'
import { uploadFileToLibrary, getFileUrl } from '@/api/files'
import { inferFileKind } from '@/utils/attachments/fileKind'

export interface PendingAttachment extends ChatAttachment {
  url?: string
}

type PickedUploadSource = {
  filePath?: string
  webFile?: File
}

function showAttachmentError(error: unknown, fallback = '上传失败，请稍后重试') {
  const message = error instanceof Error
    ? String(error.message || '').trim()
    : ''
  if (message) return
  uni.showToast({ title: fallback, icon: 'none', duration: 2200 })
}

export function useChatAttachments() {
  const pending = ref<PendingAttachment[]>([])
  const uploading = ref(false)

  const chipItems = computed<AttachmentChipItem[]>(() =>
    pending.value.map(a => ({
      fileId: a.fileId,
      originalName: a.originalName || 'file',
      kind: a.kind as string as AttachmentChipItem['kind'],
      mimeType: a.mimeType,
      url: a.url,
    })),
  )

  const hasAttachments = computed(() => pending.value.length > 0)
  const hasImageAttachments = computed(() => pending.value.some(a => a.kind === 'image'))

  function removeAttachment(fileId: string) {
    pending.value = pending.value.filter(a => a.fileId !== fileId)
  }

  function clearAttachments() {
    pending.value = []
  }

  function toRequestAttachments(): ChatAttachment[] {
    return pending.value.map(({ fileId, kind, originalName, mimeType }) => ({
      fileId,
      kind,
      originalName,
      mimeType,
    }))
  }

  async function pickAndUploadImage() {
    uploading.value = true
    try {
      const tempPath = await chooseImage()
      if (!tempPath) return

      const result = await uploadFileToLibrary({ filePath: tempPath })
      if (!result.data?.fileId) throw new Error('upload failed')

      const fileId = result.data.fileId
      const name = result.data.originalName || tempPath.split('/').pop() || 'image'
      const mime = result.data.mimeType || 'image/jpeg'

      let url = result.data.url || ''
      if (!url) {
        try {
          const urlRes = await getFileUrl(fileId, 'preview')
          url = urlRes.data?.url || ''
        } catch { /* ignore */ }
      }

      pending.value = [...pending.value, {
        fileId,
        kind: 'image' as ChatAttachmentKind,
        originalName: name,
        mimeType: mime,
        url,
      }]
    } catch (error) {
      showAttachmentError(error)
    } finally {
      uploading.value = false
    }
  }

  async function pickAndUploadDocument() {
    uploading.value = true
    try {
      const picked = await chooseFile()
      if (!picked) return

      const result = await uploadFileToLibrary({
        filePath: picked.filePath,
        webFile: picked.webFile,
        filename: picked.webFile?.name,
      })
      if (!result.data?.fileId) throw new Error('upload failed')

      const fileId = result.data.fileId
      const name = result.data.originalName || picked.webFile?.name || picked.filePath?.split('/').pop() || 'document'
      const mime = result.data.mimeType || 'application/octet-stream'

      pending.value = [...pending.value, {
        fileId,
        kind: 'document' as ChatAttachmentKind,
        originalName: name,
        mimeType: mime,
      }]
    } catch (error) {
      showAttachmentError(error)
    } finally {
      uploading.value = false
    }
  }

  async function pickAndUploadAttachment() {
    try {
      const picked = await chooseAttachment()
      if (!picked) return
      await uploadPickedSources([picked])
    } catch (error) {
      showAttachmentError(error)
    }
  }

  async function uploadWebFiles(files: File[]) {
    try {
      const picked = files
        .filter((file) => file instanceof File)
        .map((webFile) => ({ webFile }))
      if (picked.length === 0) return
      await uploadPickedSources(picked)
    } catch (error) {
      showAttachmentError(error)
    }
  }

  async function uploadPickedSources(sources: PickedUploadSource[]) {
    if (sources.length === 0) return
    uploading.value = true
    try {
      const uploaded: PendingAttachment[] = []
      for (const source of sources) {
        uploaded.push(await buildPendingAttachmentFromSource(source))
      }
      if (uploaded.length > 0) {
        pending.value = [...pending.value, ...uploaded]
      }
    } finally {
      uploading.value = false
    }
  }

  return {
    pending,
    uploading,
    chipItems,
    hasAttachments,
    hasImageAttachments,
    removeAttachment,
    clearAttachments,
    toRequestAttachments,
    pickAndUploadAttachment,
    uploadWebFiles,
    pickAndUploadImage,
    pickAndUploadDocument,
  }
}

function chooseImage(): Promise<string | null> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        resolve(res.tempFilePaths?.[0] || null)
      },
      fail: () => resolve(null),
    })
  })
}

function chooseFile(): Promise<PickedUploadSource | null> {
  // #ifndef MP-WEIXIN
  return openWebFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.txt')
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const filePath = res.tempFiles?.[0]?.path || ''
        resolve(filePath ? { filePath } : null)
      },
      fail: () => resolve(null),
    })
  })
  // #endif
}

function chooseAttachment(): Promise<PickedUploadSource | null> {
  // #ifndef MP-WEIXIN
  return openWebFilePicker()
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.chooseMessageFile({
      count: 1,
      type: 'all',
      success: (res) => {
        const filePath = res.tempFiles?.[0]?.path || ''
        resolve(filePath ? { filePath } : null)
      },
      fail: () => resolve(null),
    })
  })
  // #endif
}

function resolveAttachmentKind(
  kind: ChatAttachmentKind | 'audio' | 'video' | 'other' | undefined,
  mimeType: string | null | undefined,
  filename: string | null | undefined,
): ChatAttachmentKind {
  if (kind === 'image' || kind === 'document') {
    return kind
  }
  const inferred = inferFileKind({ mimeType, filename })
  return inferred === 'image' ? 'image' : 'document'
}

async function buildPendingAttachmentFromSource(picked: PickedUploadSource): Promise<PendingAttachment> {
  const result = await uploadFileToLibrary({
    filePath: picked.filePath,
    webFile: picked.webFile,
    filename: picked.webFile?.name,
  })
  if (!result.data?.fileId) throw new Error('upload failed')

  const fileId = result.data.fileId
  const name = result.data.originalName || picked.webFile?.name || picked.filePath?.split('/').pop() || 'file'
  const mime = result.data.mimeType || picked.webFile?.type || 'application/octet-stream'
  const resolvedKind = resolveAttachmentKind(result.data.kind, mime, name)

  let url = result.data.url || ''
  if (!url) {
    try {
      const urlRes = await getFileUrl(fileId, 'preview')
      url = urlRes.data?.url || ''
    } catch {
      // ignore
    }
  }

  return {
    fileId,
    kind: resolvedKind,
    originalName: name,
    mimeType: mime,
    url,
  }
}

function openWebFilePicker(accept?: string): Promise<PickedUploadSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) {
      input.accept = accept
    }

    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.top = '-9999px'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'

    const cleanup = () => {
      input.onchange = null
      if (input.parentNode) {
        input.parentNode.removeChild(input)
      }
    }

    input.onchange = () => {
      const file = input.files?.[0]
      cleanup()
      if (!file) {
        resolve(null)
        return
      }
      resolve({ webFile: file })
    }

    document.body.appendChild(input)
    input.click()
  })
}
