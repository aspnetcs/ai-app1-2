import type { CitationSource, MessageBlock } from '@/chat/messageBlocks'
import type { ChatAttachment } from '@/api/types/chat'
import { normalizeCitationList, normalizeMessageBlocks } from '@/chat/messageBlocks'
export interface MessageVersionItem {
  id: string
  content: string
  version: number
  model?: string
  createdAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  model?: string
  /**
   * Backend request correlation ids for debugging/support.
   * - requestId: current platform chat request id (WS/SSE stream key)
   * - traceId: end-to-end trace id (preferred) propagated via header/stream frames
   */
  requestId?: string
  traceId?: string
  status?: 'sending' | 'success' | 'error'
  serverId?: string | null
  parentMessageId?: string | null
  version?: number | null
  translationText?: string
  translationLanguage?: string
  translationStatus?: 'loading' | 'done' | 'error'
  translationError?: string
  versionList?: MessageVersionItem[]
  currentVersionIndex?: number
  reasoningContent?: string
  reasoningStatus?: 'thinking' | 'done'
  reasoningStartTime?: number
  blocks?: MessageBlock[]
  citations?: CitationSource[]
  attachments?: ChatAttachment[]
}

export interface Conversation {
  id: string
  title: string
  updatedAt: number
  pinnedAt?: number | null
  deletedAt?: number | null
  model?: string
  mode?: 'chat' | 'compare' | 'team'
  compareModelIds?: string[]
  captainMode?: 'auto' | 'fixed_first'
  pinned?: boolean
  starred?: boolean
  messageCount?: number
}

export const NEW_CONVERSATION_TITLE = '\u65b0\u5bf9\u8bdd'

type LooseRecord = Record<string, unknown>

function safeTrimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function scoreAssistantMessage(msg: Message): number {
  const content = safeTrimString(msg.content)
  const reasoning = safeTrimString(msg.reasoningContent)
  // Prefer the message that has more data (avoid dropping content when deduping).
  return content.length * 10 + reasoning.length
}

function defaultIdFactory(now: number): string {
  // Deterministic-enough; avoids bringing in crypto. Caller may override for tests.
  const rand = Math.random().toString(36).slice(2, 10)
  return `m_${now.toString(36)}_${rand}`
}

export type StreamingAssistantUpsertOptions = {
  now?: number
  idFactory?: (now: number) => string
}

export function upsertStreamingAssistantMessage(
  messages: Message[],
  requestId: string,
  patch?: Partial<Pick<Message, 'traceId' | 'model' | 'status'>>,
  options: StreamingAssistantUpsertOptions = {},
): Message | null {
  const normalizedRequestId = safeTrimString(requestId)
  if (!normalizedRequestId) return null

  const indices: number[] = []
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i]
    if (msg && msg.role === 'assistant' && msg.requestId === normalizedRequestId) {
      indices.push(i)
    }
  }

  const now = typeof options.now === 'number' ? options.now : Date.now()
  const idFactory = options.idFactory ?? defaultIdFactory

  if (indices.length === 0) {
    const created: Message = {
      id: idFactory(now),
      role: 'assistant',
      content: '',
      createdAt: now,
      status: 'sending',
      requestId: normalizedRequestId,
      ...(patch?.model ? { model: patch.model } : {}),
      ...(patch?.traceId ? { traceId: patch.traceId } : {}),
      ...(patch?.status ? { status: patch.status } : {}),
    }
    messages.push(created)
    return created
  }

  // Dedupe: keep the most-informative assistant message (by score), remove the rest.
  let keepIndex = indices[0]
  let keepScore = scoreAssistantMessage(messages[keepIndex])
  for (let i = 1; i < indices.length; i += 1) {
    const idx = indices[i]
    const score = scoreAssistantMessage(messages[idx])
    if (score > keepScore) {
      keepIndex = idx
      keepScore = score
    }
  }

  const keep = messages[keepIndex]

  // Apply patch to kept message first.
  if (patch?.traceId && !safeTrimString(keep.traceId)) {
    keep.traceId = patch.traceId
  }
  if (patch?.model && !safeTrimString(keep.model)) {
    keep.model = patch.model
  }
  if (patch?.status) {
    keep.status = patch.status
  }

  // Remove duplicates (from back to front to keep indices stable).
  for (let i = indices.length - 1; i >= 0; i -= 1) {
    const idx = indices[i]
    if (idx === keepIndex) continue
    const candidate = messages[idx]
    // Preserve missing fields on keep.
    if (candidate) {
      if (!safeTrimString(keep.traceId) && safeTrimString(candidate.traceId)) {
        keep.traceId = candidate.traceId
      }
      if (!safeTrimString(keep.model) && safeTrimString(candidate.model)) {
        keep.model = candidate.model
      }
      if (!safeTrimString(keep.content) && safeTrimString(candidate.content)) {
        keep.content = candidate.content
      }
      if (!safeTrimString(keep.reasoningContent) && safeTrimString(candidate.reasoningContent)) {
        keep.reasoningContent = candidate.reasoningContent
        keep.reasoningStatus = candidate.reasoningStatus
        keep.reasoningStartTime = candidate.reasoningStartTime
      }
    }
    messages.splice(idx, 1)
    if (idx < keepIndex) keepIndex -= 1
  }

  return messages[keepIndex] ?? keep
}

export type ApplyStreamingDeltaOptions = {
  now?: number
  isClosedRequestId?: (requestId: string) => boolean
  idFactory?: (now: number) => string
}

export function applyStreamingAssistantDelta(
  messages: Message[],
  payload: { requestId: string; delta?: string | null; traceId?: string | null; model?: string | null },
  options: ApplyStreamingDeltaOptions = {},
): Message | null {
  const requestId = safeTrimString(payload.requestId)
  if (!requestId) return null
  if (options.isClosedRequestId?.(requestId)) return null

  const now = typeof options.now === 'number' ? options.now : Date.now()
  const msg = upsertStreamingAssistantMessage(
    messages,
    requestId,
    {
      traceId: payload.traceId ? safeTrimString(payload.traceId) : undefined,
      model: payload.model ? safeTrimString(payload.model) : undefined,
    },
    { now, idFactory: options.idFactory },
  )
  if (!msg) return null

  const chunk = payload.delta ? String(payload.delta) : ''
  if (chunk) {
    msg.content += chunk
    if (msg.reasoningStatus === 'thinking') {
      msg.reasoningStatus = 'done'
    }
  }
  return msg
}

export function applyStreamingAssistantThinking(
  messages: Message[],
  payload: { requestId: string; delta?: string | null; traceId?: string | null; model?: string | null },
  options: ApplyStreamingDeltaOptions = {},
): Message | null {
  const requestId = safeTrimString(payload.requestId)
  if (!requestId) return null
  if (options.isClosedRequestId?.(requestId)) return null

  const now = typeof options.now === 'number' ? options.now : Date.now()
  const msg = upsertStreamingAssistantMessage(
    messages,
    requestId,
    {
      traceId: payload.traceId ? safeTrimString(payload.traceId) : undefined,
      model: payload.model ? safeTrimString(payload.model) : undefined,
    },
    { now, idFactory: options.idFactory },
  )
  if (!msg) return null

  const chunk = payload.delta ? String(payload.delta) : ''
  if (chunk) {
    if (!msg.reasoningContent) {
      msg.reasoningContent = ''
      msg.reasoningStatus = 'thinking'
      msg.reasoningStartTime = now
    } else if (!msg.reasoningStatus) {
      msg.reasoningStatus = 'thinking'
      msg.reasoningStartTime = now
    }
    msg.reasoningContent += chunk
  }
  return msg
}

function asRecord(raw: unknown): LooseRecord {
  if (!raw || typeof raw !== 'object') return {}
  return raw as LooseRecord
}

function toTimestamp(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw) {
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now()
}

function toOptionalTimestamp(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw) {
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

function toStringArray(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      }
    } catch {
      return []
    }
  }
  return []
}

export function normalizeConversation(raw: unknown): Conversation {
  const record = asRecord(raw)
  const compareModelIds = toStringArray(record.compareModels ?? record.compare_models)
  const mode =
    record.mode === 'team'
      ? 'team'
      : record.mode === 'compare' || compareModelIds.length > 1
        ? 'compare'
        : 'chat'
  const captainMode =
    record.captainMode === 'fixed_first' || record.captain_selection_mode === 'fixed_first'
      ? 'fixed_first'
      : record.captainMode === 'auto' || record.captain_selection_mode === 'auto'
        ? 'auto'
        : undefined
  return {
    id: String(record.id ?? ''),
    title: typeof record.title === 'string' && record.title ? record.title : '\u672a\u547d\u540d\u5bf9\u8bdd',
    updatedAt: toTimestamp(record.updated_at ?? record.updatedAt),
    pinnedAt: toOptionalTimestamp(record.pinned_at ?? record.pinnedAt),
    deletedAt: toOptionalTimestamp(record.deleted_at ?? record.deletedAt),
    model: typeof record.model === 'string' && record.model ? record.model : undefined,
    mode,
    compareModelIds,
    captainMode,
    pinned: Boolean(record.pinned),
    starred: Boolean(record.starred),
    messageCount: Number(record.message_count ?? record.messageCount ?? 0),
  }
}

export function normalizeMessageVersion(raw: unknown): MessageVersionItem {
  const record = asRecord(raw)
  return {
    id: String(record.id ?? ''),
    content: String(record.content ?? ''),
    version: Number(record.version ?? 0),
    model: typeof record.model === 'string' && record.model ? record.model : undefined,
    createdAt: toTimestamp(record.created_at ?? record.createdAt),
  }
}

export function normalizeMessage(raw: unknown): Message {
  const record = asRecord(raw)
  const role = record.role === 'assistant' || record.role === 'system' ? record.role : 'user'
  const blocks = normalizeMessageBlocks(record.blocks ?? record.messageBlocks)
  const citations = normalizeCitationList(record.citations ?? record.references)
  const translationText = safeTrimString(
    record.translationText
      ?? record.translation_text
      ?? record.translatedText
      ?? record.translated_text,
  )
  const translationLanguage = safeTrimString(
    record.translationLanguage
      ?? record.translation_language
      ?? record.targetLanguage
      ?? record.target_language,
  )
  const translationStatusRaw = safeTrimString(record.translationStatus ?? record.translation_status)
  const translationError = safeTrimString(record.translationError ?? record.translation_error)
  const translationStatus =
    translationStatusRaw === 'loading' || translationStatusRaw === 'done' || translationStatusRaw === 'error'
      ? translationStatusRaw
      : translationText
        ? 'done'
        : undefined
  return {
    id: String(record.id ?? ''),
    serverId: record.id ? String(record.id) : null,
    role,
    content: String(record.content ?? ''),
    createdAt: toTimestamp(record.created_at ?? record.createdAt),
    model: typeof record.model === 'string' && record.model ? record.model : undefined,
    parentMessageId:
      typeof record.parent_message_id === 'string' && record.parent_message_id
        ? record.parent_message_id
        : null,
    version: typeof record.version === 'number' ? record.version : null,
    translationText: translationText || undefined,
    translationLanguage: translationLanguage || undefined,
    translationStatus,
    translationError: translationError || undefined,
    status: 'success',
    blocks: blocks.length ? blocks : undefined,
    citations: citations.length ? citations : undefined,
  }
}

export function sortConversationHistory(history: Conversation[]): Conversation[] {
  // Keep pinned items in their original pinning order so opening one does not move it above earlier pins.
  const pinned: Conversation[] = []
  const unpinned: Conversation[] = []
  for (const item of history) {
    if (item.pinned) pinned.push(item)
    else unpinned.push(item)
  }
  pinned.sort((a, b) => {
    const left = a.pinnedAt ?? a.updatedAt
    const right = b.pinnedAt ?? b.updatedAt
    if (left !== right) return left - right
    return b.updatedAt - a.updatedAt
  })
  unpinned.sort((a, b) => b.updatedAt - a.updatedAt)
  history.length = 0
  history.push(...pinned, ...unpinned)
  return history
}
