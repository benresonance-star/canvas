import { describe, it, expect } from 'vitest';
import { createArtifact } from '../artifact.js';
import { newUlid } from '../shared/ulid.js';

describe('artifact invariants', () => {
  it('rejects confidence on artifact', () => {
    expect(() =>
      createArtifact({
        id: newUlid(),
        type: 'doc',
        uri: 'file://test',
        content_hash: 'abc',
        retrieved_at: new Date().toISOString(),
        confidence: {},
      }),
    ).toThrow(/confidence/);
  });

  it('accepts valid artifact', () => {
    const a = createArtifact({
      id: newUlid(),
      type: 'doc',
      uri: 'folder-relative:p1/file.pdf',
      content_hash: 'deadbeef',
      retrieved_at: new Date().toISOString(),
    });
    expect(a.type).toBe('doc');
  });

  it('accepts user_note artifact type', () => {
    const a = createArtifact({
      id: newUlid(),
      type: 'user_note',
      uri: 'folder-relative:p1/notes__draft-v1.md',
      content_hash: 'deadbeef',
      retrieved_at: new Date().toISOString(),
    });
    expect(a.type).toBe('user_note');
  });

  it('accepts agent_chat artifact type', () => {
    const a = createArtifact({
      id: newUlid(),
      type: 'agent_chat',
      uri: 'canvas-agent-chat:p1/openai',
      content_hash: 'deadbeef',
      retrieved_at: new Date().toISOString(),
    });
    expect(a.type).toBe('agent_chat');
  });
});
