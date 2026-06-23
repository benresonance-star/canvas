import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../previewStore.js', () => ({
  getPreview: vi.fn(),
}));

vi.mock('../readFile.js', () => ({
  readFileEntry: vi.fn(),
}));

import { getPreview } from '../previewStore.js';
import { readFileEntry } from '../readFile.js';
import { loadContextDocumentForCard } from '../agentContextContent.js';

function imageCard(overrides = {}) {
  return {
    id: 'img-1',
    name: 'Facade',
    type: 'image',
    pinnedVersion: 1,
    versions: [
      {
        version: 1,
        filename: 'facade.png',
        previewCacheKey: 'preview-key-1',
        content_hash: 'hash1',
      },
    ],
    ...overrides,
  };
}

function installFileReaderMock(dataUrl = 'data:image/png;base64,cG5nLWJ5dGVz') {
  class MockFileReader {
    readAsDataURL() {
      this.result = dataUrl;
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('FileReader', MockFileReader);
}

describe('loadContextDocumentForCard (image)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFileReaderMock();
  });

  it('loads image from preview cache when folder is not linked', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    getPreview.mockResolvedValue(blob);

    const doc = await loadContextDocumentForCard(imageCard(), { folderHandle: null });

    expect(doc.status).toBe('included');
    expect(doc.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(doc.imageDetail).toBe('low');
    expect(getPreview).toHaveBeenCalledWith('preview-key-1');
  });

  it('loads image from folder when preview cache is empty', async () => {
    getPreview.mockResolvedValue(null);
    readFileEntry.mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,/9j/abc',
    });
    const folderHandle = {
      getFileHandle: vi.fn().mockResolvedValue({}),
    };

    const card = imageCard({
      versions: [{ version: 1, filename: 'photo.jpg', content_hash: 'h2' }],
    });
    const doc = await loadContextDocumentForCard(card, { folderHandle });

    expect(doc.status).toBe('included');
    expect(doc.imageDataUrl).toBe('data:image/jpeg;base64,/9j/abc');
    expect(folderHandle.getFileHandle).toHaveBeenCalledWith('photo.jpg', undefined);
  });

  it('returns needs_folder when no preview, inline data, artifact, or folder', async () => {
    const card = imageCard({
      versions: [{ version: 1, filename: 'photo.png', content_hash: 'h3' }],
    });
    const doc = await loadContextDocumentForCard(card, { folderHandle: null });
    expect(doc.status).toBe('needs_folder');
  });

  it('loads image from inline dataUrl on pinned version', async () => {
    const card = imageCard({
      versions: [{
        version: 1,
        dataUrl: 'data:image/png;base64,Z2VuZXJhdGVk',
        artifactRef: { id: 'artifact-1', type: 'artifact' },
        content_hash: 'h4',
      }],
    });
    const doc = await loadContextDocumentForCard(card, { folderHandle: null });
    expect(doc.status).toBe('included');
    expect(doc.imageDataUrl).toBe('data:image/png;base64,Z2VuZXJhdGVk');
  });

  it('loads generated image from artifact payload_text', async () => {
    const card = imageCard({
      versions: [{
        version: 1,
        artifactRef: { id: 'artifact-generated', type: 'artifact' },
        content_hash: 'h5',
      }],
    });
    const doc = await loadContextDocumentForCard(card, {
      folderHandle: null,
      fetchArtifact: async () => ({
        artifact: { payload_text: 'data:image/png;base64,Z2VuZXJhdGVkQXJ0aWZhY3Q=' },
      }),
    });
    expect(doc.status).toBe('included');
    expect(doc.imageDataUrl).toBe('data:image/png;base64,Z2VuZXJhdGVkQXJ0aWZhY3Q=');
  });
});
