import { describe, expect, it } from 'vitest'
import { buildChatRequestPayload } from './chatRequestPayload'

describe('buildChatRequestPayload', () => {
  it('includes isTemporary for temporary chats', () => {
    expect(
      buildChatRequestPayload('gpt-4o', [{ role: 'user', content: 'hello' }], true),
    ).toMatchObject({
      model: 'gpt-4o',
      stream: true,
      isTemporary: true,
    })
  })

  it('omits isTemporary for persistent chats', () => {
    expect(
      buildChatRequestPayload('gpt-4o', [{ role: 'user', content: 'hello' }], false),
    ).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
    })
  })

  it('supports runtime payload options for knowledge and memory flags', () => {
    expect(
      buildChatRequestPayload('gpt-4o', [{ role: 'user', content: 'hello' }], {
        maskId: 'agent-1',
        knowledgeBaseIds: ['kb-1', 'kb-2'],
        memoryEnabled: true,
      }),
    ).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
      maskId: 'agent-1',
      knowledgeBaseIds: ['kb-1', 'kb-2'],
      memoryEnabled: true,
    })
  })
})
