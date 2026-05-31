import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../folderStore.js', () => ({
  loadFolderHandle: vi.fn(),
  saveFolderHandle: vi.fn(),
  removeFolderHandle: vi.fn(),
}));

import {
  loadFolderHandle,
  saveFolderHandle,
  removeFolderHandle,
} from '../folderStore.js';
import { migrateFolderHandlesOnIndexRepair } from '../folderMigrate.js';

describe('migrateFolderHandlesOnIndexRepair', () => {
  beforeEach(() => {
    vi.mocked(loadFolderHandle).mockReset();
    vi.mocked(saveFolderHandle).mockReset();
    vi.mocked(removeFolderHandle).mockReset();
  });

  it('moves handle from removed id to kept project with same name', async () => {
    const handle = { name: 'test folder' };
    vi.mocked(loadFolderHandle).mockImplementation(async (id) => {
      if (id === 'removed-1') return handle;
      if (id === 'kept-1') return null;
      return null;
    });

    await migrateFolderHandlesOnIndexRepair(
      {
        projects: [
          { id: 'removed-1', name: 'My Project', connectedFolderName: 'test folder' },
          { id: 'kept-1', name: 'My Project', connectedFolderName: 'test folder' },
        ],
      },
      {
        projects: [{ id: 'kept-1', name: 'My Project', connectedFolderName: 'test folder' }],
      },
      ['removed-1'],
    );

    expect(saveFolderHandle).toHaveBeenCalledWith('kept-1', handle);
    expect(removeFolderHandle).toHaveBeenCalledWith('removed-1');
  });

  it('does not overwrite handle already on kept project', async () => {
    const removedHandle = { name: 'test folder' };
    const keptHandle = { name: 'other' };
    vi.mocked(loadFolderHandle).mockImplementation(async (id) => {
      if (id === 'removed-1') return removedHandle;
      if (id === 'kept-1') return keptHandle;
      return null;
    });

    await migrateFolderHandlesOnIndexRepair(
      {
        projects: [
          { id: 'removed-1', name: 'Dup' },
          { id: 'kept-1', name: 'Dup' },
        ],
      },
      { projects: [{ id: 'kept-1', name: 'Dup' }] },
      ['removed-1'],
    );

    expect(saveFolderHandle).not.toHaveBeenCalled();
    expect(removeFolderHandle).toHaveBeenCalledWith('removed-1');
  });

  it('no-ops when removedIds empty', async () => {
    await migrateFolderHandlesOnIndexRepair({ projects: [] }, { projects: [] }, []);
    expect(loadFolderHandle).not.toHaveBeenCalled();
  });
});
