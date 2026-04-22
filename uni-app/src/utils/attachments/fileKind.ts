import type { FileKind } from '@/api/types/files'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function inferFileExtension(filename: string | null | undefined): string {
  const text = normalizeText(filename)
  if (!text) return ''
  const lastDot = text.lastIndexOf('.')
  if (lastDot < 0) return ''
  const ext = text.slice(lastDot + 1).trim()
  return ext || ''
}

export function inferFileKindFromMime(mimeType: string | null | undefined): FileKind {
  const text = normalizeText(mimeType)
  if (!text) return 'other'
  if (text.startsWith('image/')) return 'image'
  if (text.startsWith('audio/')) return 'audio'
  if (text.startsWith('video/')) return 'video'
  if (text === 'application/pdf') return 'document'
  if (text.startsWith('text/')) return 'document'
  return 'other'
}

export function inferFileKindFromName(filename: string | null | undefined): FileKind {
  const ext = inferFileExtension(filename)
  if (!ext) return 'other'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) return 'audio'
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['pdf', 'txt', 'md', 'json', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'document'
  return 'other'
}

export function inferFileKind(input: { mimeType?: string | null; filename?: string | null }): FileKind {
  const byMime = inferFileKindFromMime(input.mimeType)
  if (byMime !== 'other') return byMime
  return inferFileKindFromName(input.filename)
}

