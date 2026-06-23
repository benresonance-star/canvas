import { describe, expect, it, vi } from 'vitest';
import { agentCardFromRecord, generatedImageCardFromOutput } from '../agentArtifact.js';

describe('agentArtifact domain helpers', () => {
  it('creates a canvas card for an agent artifact', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('card-1');
    const card = agentCardFromRecord({
      id: 'agent-1',
      name: 'Facade Agent',
      agentTypeId: 'agent_type_image_generation',
      projectId: 'project-1',
    });
    expect(card).toMatchObject({
      id: 'card-1',
      type: 'agent',
      agentArtifactId: 'agent-1',
      key: 'agent__agent-1',
    });
  });

  it('creates image cards from execution outputs', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('image-card-1');
    const card = generatedImageCardFromOutput({
      id: 'artifact-1',
      filename: 'generated.png',
      filePath: 'projects/project/generated/agent/generated.png',
      contentHash: 'hash-1',
      dataUrl: 'data:image/png;base64,abc',
    });
    expect(card.type).toBe('image');
    expect(card.versions[0]).toMatchObject({
      artifactRef: { id: 'artifact-1', type: 'artifact' },
      filename: 'generated.png',
      content_hash: 'hash-1',
      dataUrl: 'data:image/png;base64,abc',
    });
  });
});
