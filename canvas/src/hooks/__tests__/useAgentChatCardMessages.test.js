import { describe, it, expect } from 'vitest';
import { resolveAgentChatTranscriptSources } from '../useAgentChatCardMessages.js';

describe('resolveAgentChatTranscriptSources', () => {
  it('prefers thread index artifactRef when pinned version lacks one', () => {
    const sources = resolveAgentChatTranscriptSources({
      pinned: { artifactRef: null },
      threadMeta: {
        artifactRef: { id: 'art-1' },
        filename: 'notes__agent-chat-openai-abc-v1.md',
      },
      card: {
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    });
    expect(sources.effectiveArtifactRef).toEqual({ id: 'art-1' });
    expect(sources.filename).toBe('notes__agent-chat-openai-abc-v1.md');
  });

  it('uses pinned content when present', () => {
    const sources = resolveAgentChatTranscriptSources({
      pinned: { content: '# transcript\n\n---\n\n[12:00:00] User:\nHi' },
      threadMeta: { artifactRef: { id: 'art-1' } },
    });
    expect(sources.localTranscript).toContain('User:');
    expect(sources.effectiveArtifactRef).toEqual({ id: 'art-1' });
  });
});
