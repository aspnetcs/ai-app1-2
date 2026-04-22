<template>
  <view class="attachment-chip" @click="handlePreview" @tap="handlePreview">
    <view class="attachment-main">
      <text class="attachment-name">{{ item.originalName || 'file' }}</text>
      <text v-if="item.kind" class="attachment-kind">{{ item.kind }}</text>
    </view>

    <view v-if="showRemove" class="attachment-remove" @click.stop="handleRemove" @tap.stop="handleRemove">
      <text class="attachment-remove-text">x</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { FileKind } from '@/api/types/files'
import { previewRemoteFile } from '@/utils/attachments/preview'

export type AttachmentChipItem = {
  fileId: string
  originalName: string
  kind?: FileKind
  mimeType?: string
  url?: string
}

const props = defineProps<{
  item: AttachmentChipItem
  showRemove?: boolean
}>()

const emit = defineEmits<{
  (e: 'preview', item: AttachmentChipItem): void
  (e: 'remove', fileId: string): void
}>()

const showRemove = props.showRemove === true

async function handlePreview() {
  const url = (props.item.url || '').trim()
  if (url) {
    await previewRemoteFile({
      url,
      kind: props.item.kind,
      mimeType: props.item.mimeType,
      filename: props.item.originalName,
    })
    return
  }
  emit('preview', props.item)
}

function handleRemove() {
  emit('remove', props.item.fileId)
}
</script>

<style scoped>
.attachment-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #e6e6e6;
  border-radius: 10px;
  background: #fff;
}

.attachment-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.attachment-name {
  font-size: 12px;
  color: #111;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-kind {
  font-size: 11px;
  color: #666;
}

.attachment-remove {
  width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f1f1;
  flex-shrink: 0;
}

.attachment-remove-text {
  font-size: 12px;
  color: #333;
  line-height: 1;
}
</style>

