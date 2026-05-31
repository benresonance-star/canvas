import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../folderStore.js', () => ({
  saveFolderHandle: vi.fn(),
  loadFolderHandle: vi.fn(),
}));

import { saveFolderHandle, loadFolderHandle } from '../folderStore.js';
import { verifyFolderHandleStored } from '../folderPersist.js';

describe('verifyFolderHandleStored', () => {
  beforeEach(() => {
    vi.mocked(saveFolderHandle).mockReset();
    vi.mocked(loadFolderHandle).mockReset();
  });

  it('returns true when save round-trips', async () => {
    const handle = { name: 'docs' };
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const ok = await verifyFolderHandleStored('p1', handle);
    expect(ok).toBe(true);
    expect(saveFolderHandle).toHaveBeenCalledWith('p1', handle);
  });

  it('returns false when load returns null after save', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(null);
    const ok = await verifyFolderHandleStored('p1', { name: 'docs' });
    expect(ok).toBe(false);
  });

  it('returns false for missing projectId or handle', async () => {
    expect(await verifyFolderHandleStored('', { name: 'x' })).toBe(false);
    expect(await verifyFolderHandleStored('p1', null)).toBe(false);
    expect(saveFolderHandle).not.toHaveBeenCalled();
  });
});
