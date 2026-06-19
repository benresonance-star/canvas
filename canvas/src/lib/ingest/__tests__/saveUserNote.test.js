import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnsureWritePermission = vi.fn();
const mockGetFileHandleAtPath = vi.fn();
const mockOverwriteTextFileAtPath = vi.fn();
const mockReadFileEntry = vi.fn();
const mockIsApiAvailable = vi.fn();
const mockUpdateArtifactContent = vi.fn();
const mockIngestFoundFiles = vi.fn();
const mockIngestLinksFromVersions = vi.fn();
const mockBuildCardKeyToArtifactRef = vi.fn();

vi.mock('../../folderWrite.js', () => ({
  ensureWritePermission: (...args) => mockEnsureWritePermission(...args),
  getFileHandleAtPath: (...args) => mockGetFileHandleAtPath(...args),
  overwriteTextFileAtPath: (...args) => mockOverwriteTextFileAtPath(...args),
  renameUserNoteFile: vi.fn(),
  fileExistsInFolder: vi.fn(),
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

import { saveUserNote } from '../saveUserNote.js';

describe('saveUserNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureWritePermission.mockResolvedValue(true);
    mockIsApiAvailable.mockResolvedValue(false);
    mockBuildCardKeyToArtifactRef.mockReturnValue(new Map());
    mockOverwriteTextFileAtPath.mockResolvedValue('notes/sub/notes__a-v1.md');
    mockGetFileHandleAtPath.mockResolvedValue({});
    mockReadFileEntry.mockResolvedValue({
      content: 'updated body',
      content_hash: 'hash-1',
    });
  });

  it('returns no_folder when folder handle is missing', async () => {
    const result = await saveUserNote({
      folderHandle: null,
      card: { versions: [{ version: 1, filename: 'notes__a-v1.md' }] },
      versionNum: 1,
      body: 'body',
    });
    expect(result).toEqual({ ok: false, reason: 'no_folder' });
  });

  it('writes nested relativePath via overwriteTextFileAtPath', async () => {
    const card = {
      id: 'n1',
      key: 'notes/sub/notes__a',
      name: 'a',
      type: 'user_note',
      prefix: 'notes',
      versions: [{
        version: 1,
        filename: 'notes__a-v1.md',
        relativePath: 'notes/sub/notes__a-v1.md',
        content: 'old',
      }],
    };

    const result = await saveUserNote({
      projectId: 'proj-1',
      projectName: 'Project',
      folderHandle: {},
      clusterId: null,
      card,
      versionNum: 1,
      body: 'updated body',
      name: 'a',
      cards: [card],
    });

    expect(result.ok).toBe(true);
    expect(mockOverwriteTextFileAtPath).toHaveBeenCalledWith(
      {},
      'notes/sub/notes__a-v1.md',
      'updated body',
    );
    expect(mockGetFileHandleAtPath).toHaveBeenCalled();
  });

  it('writes root filename when no relativePath is set', async () => {
    const card = {
      id: 'n2',
      key: 'notes__a',
      name: 'a',
      type: 'user_note',
      prefix: 'notes',
      versions: [{
        version: 1,
        filename: 'notes__a-v1.md',
        content: 'old',
      }],
    };

    const result = await saveUserNote({
      projectId: 'proj-1',
      projectName: 'Project',
      folderHandle: {},
      clusterId: null,
      card,
      versionNum: 1,
      body: 'updated body',
      name: 'a',
      cards: [card],
    });

    expect(result.ok).toBe(true);
    expect(mockOverwriteTextFileAtPath).toHaveBeenCalledWith(
      {},
      'notes__a-v1.md',
      'updated body',
    );
  });
});
