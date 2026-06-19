import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnsureWritePermission = vi.fn();
const mockGetFileHandleAtPath = vi.fn();
const mockReadFileEntry = vi.fn();
const mockIsApiAvailable = vi.fn();
const mockUpdateArtifactContent = vi.fn();
const mockIngestFoundFiles = vi.fn();
const mockIngestLinksFromVersions = vi.fn();
const mockBuildCardKeyToArtifactRef = vi.fn();

vi.mock('../../folderWrite.js', () => ({
  ensureWritePermission: (...args) => mockEnsureWritePermission(...args),
  getFileHandleAtPath: (...args) => mockGetFileHandleAtPath(...args),
}));

vi.mock('../../readFile.js', () => ({
  readFileEntry: (...args) => mockReadFileEntry(...args),
}));

vi.mock('../../primitivesApi.js', () => ({
  isApiAvailable: (...args) => mockIsApiAvailable(...args),
  updateArtifactContent: (...args) => mockUpdateArtifactContent(...args),
}));

vi.mock('../syncIngest.js', () => ({
  ingestFoundFiles: (...args) => mockIngestFoundFiles(...args),
}));

vi.mock('../linkIngest.js', () => ({
  ingestLinksFromVersions: (...args) => mockIngestLinksFromVersions(...args),
  buildCardKeyToArtifactRef: (...args) => mockBuildCardKeyToArtifactRef(...args),
}));

import { saveMarkdownArtifact } from '../saveMarkdownArtifact.js';

describe('saveMarkdownArtifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureWritePermission.mockResolvedValue(true);
    mockIsApiAvailable.mockResolvedValue(false);
    mockBuildCardKeyToArtifactRef.mockReturnValue(new Map());
    mockGetFileHandleAtPath.mockResolvedValue({
      createWritable: async () => ({
        write: vi.fn(),
        close: vi.fn(),
      }),
    });
    mockReadFileEntry.mockResolvedValue({
      content: 'updated body',
      content_hash: 'hash-1',
    });
  });

  it('returns no_folder when folder handle is missing', async () => {
    const result = await saveMarkdownArtifact({
      folderHandle: null,
      card: { versions: [{ version: 1, filename: 'markdown__readme-v1.md' }] },
      versionNum: 1,
      body: 'body',
    });
    expect(result).toEqual({ ok: false, reason: 'no_folder' });
  });

  it('overwrites markdown file and returns updated versions', async () => {
    const card = {
      id: 'md-1',
      key: 'markdown__readme',
      name: 'readme',
      type: 'markdown',
      prefix: 'markdown',
      versions: [{
        version: 1,
        filename: 'markdown__readme-v1.md',
        content: 'old',
      }],
    };

    const result = await saveMarkdownArtifact({
      projectId: 'proj-1',
      projectName: 'Project',
      folderHandle: {},
      clusterId: null,
      card,
      versionNum: 1,
      body: 'updated body',
      cards: [card],
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates.versions[0].content).toBe('updated body');
    expect(mockGetFileHandleAtPath).toHaveBeenCalled();
  });
});
