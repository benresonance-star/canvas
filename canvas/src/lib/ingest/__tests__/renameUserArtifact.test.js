import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRenameUserNoteFileAtPath = vi.fn();
const mockFileExistsAtFolderPath = vi.fn();
const mockGetFileHandleAtPath = vi.fn();
const mockReadFileEntry = vi.fn();

vi.mock('../../folderWrite.js', () => ({
  fileExistsAtFolderPath: (...args) => mockFileExistsAtFolderPath(...args),
  renameUserNoteFileAtPath: (...args) => mockRenameUserNoteFileAtPath(...args),
  getFileHandleAtPath: (...args) => mockGetFileHandleAtPath(...args),
}));

vi.mock('../../readFile.js', () => ({
  readFileEntry: (...args) => mockReadFileEntry(...args),
}));

import { renameAllArtifactVersions } from '../renameUserArtifact.js';

describe('renameAllArtifactVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileExistsAtFolderPath.mockResolvedValue(false);
    mockGetFileHandleAtPath.mockResolvedValue({});
    mockReadFileEntry.mockResolvedValue({
      content: 'body',
      content_hash: 'hash-1',
    });
  });

  it('updates card key and version paths after rename', async () => {
    mockRenameUserNoteFileAtPath.mockResolvedValue('tasks__Renamed Task-v1.md');

    const card = {
      key: 'tasks__Live Tasks',
      prefix: 'tasks',
      name: 'Live Tasks',
      versions: [{
        version: 1,
        filename: 'tasks__Live Tasks-v1.md',
      }],
    };

    const result = await renameAllArtifactVersions({
      folderHandle: {},
      card,
      versionNum: 1,
      body: 'body',
      newName: 'Renamed Task',
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates).toMatchObject({
      key: 'tasks__Renamed Task',
      name: 'Renamed Task',
      relativePath: null,
    });
    expect(result.cardUpdates.versions[0]).toMatchObject({
      filename: 'tasks__Renamed Task-v1.md',
      relativePath: 'tasks__Renamed Task-v1.md',
      cardKey: 'tasks__Renamed Task',
    });
  });
});
