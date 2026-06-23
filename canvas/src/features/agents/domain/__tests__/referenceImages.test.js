import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/agentContextContent.js', () => ({
  loadImageDataUrlForPinned: vi.fn(),
}));

import { loadImageDataUrlForPinned } from '../../../../lib/agentContextContent.js';
import { resolveAgentReferenceImages } from '../referenceImages.js';

function imageCard(overrides = {}) {
  return {
    id: 'card-image',
    name: 'Facade reference',
    type: 'image',
    pinnedVersion: 1,
    versions: [{
      version: 1,
      filename: 'facade.png',
      ext: 'png',
      artifactRef: { id: 'artifact-image', type: 'artifact' },
    }],
    ...overrides,
  };
}

describe('resolveAgentReferenceImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns transient source image data for selected image references', async () => {
    vi.mocked(loadImageDataUrlForPinned).mockResolvedValue('data:image/png;base64,c291cmNl');
    const folderHandle = { name: 'Project' };

    const result = await resolveAgentReferenceImages({
      cards: [imageCard()],
      referenceArtifactIds: ['artifact-image'],
      folderHandle,
    });

    expect(result).toEqual([{
      artifactId: 'artifact-image',
      dataUrl: 'data:image/png;base64,c291cmNl',
      filename: 'facade.png',
    }]);
    expect(loadImageDataUrlForPinned).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'facade.png' }),
      folderHandle,
    );
  });

  it('throws before execution when a selected image reference has no source bytes', async () => {
    vi.mocked(loadImageDataUrlForPinned).mockResolvedValue(null);

    await expect(
      resolveAgentReferenceImages({
        cards: [imageCard()],
        referenceArtifactIds: ['artifact-image'],
      }),
    ).rejects.toThrow('source image bytes are unavailable');
  });

  it('ignores non-image references in the transient image payload', async () => {
    const result = await resolveAgentReferenceImages({
      cards: [{
        id: 'card-note',
        name: 'Notes',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          artifactRef: { id: 'artifact-note', type: 'artifact' },
        }],
      }],
      referenceArtifactIds: ['artifact-note'],
    });

    expect(result).toEqual([]);
    expect(loadImageDataUrlForPinned).not.toHaveBeenCalled();
  });
});
