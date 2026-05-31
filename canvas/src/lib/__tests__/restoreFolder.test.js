import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../folderStore.js', () => ({
  loadFolderHandle: vi.fn(),
}));

import { loadFolderHandle } from '../folderStore.js';
import {
  linkFolderForProject,
  restoreFolderForProject,
  reconnectFolderForProject,
} from '../restoreFolder.js';
import {
  getCachedFolderHandle,
  resetFolderSessionCacheForTests,
  setCachedFolderHandle,
} from '../folderSessionCache.js';

function mockHandle(permSequence) {
  let i = 0;
  const next = () => permSequence[i++] ?? 'denied';
  return {
    name: 'MyProject',
    queryPermission: vi.fn(async () => next()),
    requestPermission: vi.fn(async () => next()),
  };
}

describe('restoreFolder', () => {
  beforeEach(() => {
    vi.mocked(loadFolderHandle).mockReset();
    resetFolderSessionCacheForTests();
  });

  it('linkFolderForProject returns not stored when no handle', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(null);
    const result = await linkFolderForProject('p1');
    expect(result.stored).toBe(false);
    expect(result.granted).toBe(false);
  });

  it('restoreFolderForProject returns not stored when no handle', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(null);
    const result = await restoreFolderForProject('p1');
    expect(result.stored).toBe(false);
    expect(result.granted).toBe(false);
  });

  it('linkFolderForProject grants handle when permission still granted', async () => {
    const handle = mockHandle(['granted']);
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const result = await linkFolderForProject('p1');
    expect(result.granted).toBe(true);
    expect(result.handle).toBe(handle);
    expect(result.needsPermission).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(getCachedFolderHandle('p1')).toBe(handle);
  });

  it('linkFolderForProject uses session cache before IDB', async () => {
    const cached = mockHandle(['granted']);
    setCachedFolderHandle('p1', cached);
    const result = await linkFolderForProject('p1');
    expect(result.granted).toBe(true);
    expect(result.handle).toBe(cached);
    expect(loadFolderHandle).not.toHaveBeenCalled();
  });

  it('linkFolderForProject needs permission without user gesture', async () => {
    const handle = mockHandle(['prompt']);
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const result = await linkFolderForProject('p1', { requestIfNeeded: false });
    expect(result.stored).toBe(true);
    expect(result.granted).toBe(false);
    expect(result.needsPermission).toBe(true);
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('linkFolderForProject requests permission when requestIfNeeded is true', async () => {
    const handle = mockHandle(['prompt', 'prompt', 'granted']);
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const result = await linkFolderForProject('p1', { requestIfNeeded: true });
    expect(result.granted).toBe(true);
    expect(result.handle).toBe(handle);
    expect(handle.requestPermission).toHaveBeenCalled();
    expect(getCachedFolderHandle('p1')).toBe(handle);
  });

  it('reconnectFolderForProject requests permission on stored handle', async () => {
    const handle = mockHandle(['prompt', 'granted']);
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const result = await reconnectFolderForProject('p1');
    expect(result.ok).toBe(true);
    expect(result.handle).toBe(handle);
    expect(handle.requestPermission).toHaveBeenCalled();
    expect(getCachedFolderHandle('p1')).toBe(handle);
  });

  it('reconnectFolderForProject returns not_stored when missing', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(null);
    const result = await reconnectFolderForProject('p1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_stored');
  });

  it('reconnectFolderForProject returns denied when user rejects', async () => {
    const handle = mockHandle(['denied', 'denied']);
    vi.mocked(loadFolderHandle).mockResolvedValue(handle);
    const result = await reconnectFolderForProject('p1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('denied');
  });
});
