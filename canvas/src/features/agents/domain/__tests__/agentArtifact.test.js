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
    const relativePath = 'generated/agent/generated.png';
    const card = generatedImageCardFromOutput({
      id: 'artifact-1',
      filename: 'generated.png',
      filePath: `projects/project/${relativePath}`,
      contentHash: 'hash-1',
      dataUrl: 'data:image/png;base64,abc',
    });
    expect(card.type).toBe('image');
    expect(card.key).toBe('generated/agent/generated');
    expect(card.versions[0]).toMatchObject({
      artifactRef: { id: 'artifact-1', type: 'artifact' },
      filename: 'generated.png',
      relativePath,
      content_hash: 'hash-1',
      dataUrl: 'data:image/png;base64,abc',
    });
    expect(card.versions[0].imageMetadata).toMatchObject({
      mimeType: 'image/png',
      ext: 'png',
    });
  });

  it('uses server image metadata when provided on output', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('image-card-2');
    const card = generatedImageCardFromOutput({
      id: 'artifact-2',
      filename: 'generated.png',
      filePath: 'projects/project/generated/agent/generated.png',
      contentHash: 'hash-2',
      metadata: {
        image: {
          mimeType: 'image/png',
          ext: 'png',
          fileSizeBytes: 2048,
          width: 1024,
          height: 1024,
          bitDepth: 8,
        },
        originalPromptSnapshot: 'A brick facade',
        agentPromptSnapshot: 'Goal: Render\n\nPrompt:\nA brick facade',
      },
    });
    expect(card.versions[0].imageMetadata).toMatchObject({
      width: 1024,
      height: 1024,
      bitDepth: 8,
    });
    expect(card.versions[0].generatedMetadata.originalPromptSnapshot).toBe('A brick facade');
  });
});
