import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnsureWritePermission = vi.fn();
const mockGetFileHandleAtPath = vi.fn();
const mockOverwriteTextFileAtPath = vi.fn();
const mockRenameUserNoteFileAtPath = vi.fn();
const mockFileExistsAtFolderPath = vi.fn();
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
  renameUserNoteFileAtPath: (...args) => mockRenameUserNoteFileAtPath(...args),
  fileExistsAtFolderPath: (...args) => mockFileExistsAtFolderPath(...args),
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

import { saveUserTask } from '../saveUserTask.js';

describe('saveUserTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureWritePermission.mockResolvedValue(true);
    mockFileExistsAtFolderPath.mockResolvedValue(false);
    mockIsApiAvailable.mockResolvedValue(false);
    mockBuildCardKeyToArtifactRef.mockReturnValue(new Map());
    mockGetFileHandleAtPath.mockResolvedValue({});
    mockReadFileEntry.mockResolvedValue({
      content: '---\ntaskStatus: general\n---\nbody',
      content_hash: 'hash-1',
    });
  });

  it('includes renamed title in cardUpdates', async () => {
    const newRelativePath = 'tasks__CURRENT HIGH-LEVEL TASKS-v1.md';
    mockRenameUserNoteFileAtPath.mockResolvedValue(newRelativePath);

    const card = {
      id: 't1',
      key: 'tasks__LIVE TASKS',
      name: 'LIVE TASKS',
      type: 'user_task',
      prefix: 'tasks',
      taskStatus: 'general',
      versions: [{
        version: 1,
        filename: 'tasks__LIVE TASKS-v1.md',
        content: '---\ntaskStatus: general\n---\nbody',
      }],
    };

    const result = await saveUserTask({
      projectId: 'proj-1',
      projectName: 'Project',
      folderHandle: {},
      clusterId: null,
      card,
      versionNum: 1,
      body: 'body',
      name: 'CURRENT HIGH-LEVEL TASKS',
      taskStatus: 'general',
      cards: [card],
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates).toMatchObject({
      name: 'CURRENT HIGH-LEVEL TASKS',
      key: 'tasks__CURRENT HIGH-LEVEL TASKS',
      taskStatus: 'general',
    });
    expect(result.cardUpdates.versions[0]).toMatchObject({
      filename: 'tasks__CURRENT HIGH-LEVEL TASKS-v1.md',
      relativePath: newRelativePath,
      cardKey: 'tasks__CURRENT HIGH-LEVEL TASKS',
    });
    expect(mockRenameUserNoteFileAtPath).toHaveBeenCalledWith(
      {},
      'tasks__LIVE TASKS-v1.md',
      expect.objectContaining({
        prefix: 'tasks',
        name: 'CURRENT HIGH-LEVEL TASKS',
        version: 1,
      }),
    );
  });

  it('preserves nested folder path when renaming', async () => {
    const newRelativePath = 'inbox/tasks__CURRENT HIGH-LEVEL TASKS-v1.md';
    mockRenameUserNoteFileAtPath.mockResolvedValue(newRelativePath);

    const card = {
      id: 't2',
      key: 'inbox/tasks__LIVE TASKS',
      name: 'LIVE TASKS',
      type: 'user_task',
      prefix: 'tasks',
      relativePath: 'inbox/tasks__LIVE TASKS-v1.md',
      versions: [{
        version: 1,
        filename: 'tasks__LIVE TASKS-v1.md',
        relativePath: 'inbox/tasks__LIVE TASKS-v1.md',
        content: '---\ntaskStatus: general\n---\nbody',
      }],
    };

    const result = await saveUserTask({
      projectId: 'proj-1',
      projectName: 'Project',
      folderHandle: {},
      clusterId: null,
      card,
      versionNum: 1,
      body: 'body',
      name: 'CURRENT HIGH-LEVEL TASKS',
      cards: [card],
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates).toMatchObject({
      key: 'inbox/tasks__CURRENT HIGH-LEVEL TASKS',
      relativePath: newRelativePath,
    });
    expect(mockRenameUserNoteFileAtPath).toHaveBeenCalledWith(
      {},
      'inbox/tasks__LIVE TASKS-v1.md',
      expect.any(Object),
    );
  });
});
