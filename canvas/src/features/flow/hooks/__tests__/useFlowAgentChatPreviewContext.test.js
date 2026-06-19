import { describe, expect, it } from 'vitest';
import { resolveAgentChatConnectorIdForCard } from '../useFlowAgentChatPreviewContext.js';

describe('useFlowAgentChatPreviewContext helpers', () => {
  it('resolveAgentChatConnectorIdForCard reads connector from filename', () => {
    const card = {
      type: 'agent_chat',
      versions: [{ filename: 'notes__agent-chat-ollama-gemma-12b-abcd1234-v1.md' }],
    };
    expect(resolveAgentChatConnectorIdForCard(card)).toBe('ollama-gemma-12b');
  });

  it('resolveAgentChatConnectorIdForCard returns null for non agent_chat cards', () => {
    expect(resolveAgentChatConnectorIdForCard({ type: 'markdown' })).toBeNull();
  });
});
