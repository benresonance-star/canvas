import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../projectRevision.js', () => ({
  readCachedRevision: vi.fn(),
  writeCachedRevision: vi.fn(),
  clearCachedRevision: vi.fn(),
}));

import {
  readCachedRevision,
  writeCachedRevision,
  clearCachedRevision,
} from '../projectRevision.js';
import { migrateRevisionsOnIndexRepair } from '../projectSync.js';

describe('migrateRevisionsOnIndexRepair', () => {
  beforeEach(() => {
    vi.mocked(readCachedRevision).mockReset();
    vi.mocked(writeCachedRevision).mockReset();
    vi.mocked(clearCachedRevision).mockReset();
  });

  it('copies higher revision from removed id to kept project with same name', async () => {
    vi.mocked(readCachedRevision).mockImplementation(async (id) => {
      if (id === 'removed-1') return 7;
      if (id === 'kept-1') return 2;
      return 0;
    });

    await migrateRevisionsOnIndexRepair(
      {
        projects: [
          { id: 'removed-1', name: 'Alpha' },
          { id: 'kept-1', name: 'Alpha' },
        ],
      },
      { projects: [{ id: 'kept-1', name: 'Alpha' }] },
      ['removed-1'],
    );

    expect(writeCachedRevision).toHaveBeenCalledWith('kept-1', 7);
    expect(clearCachedRevision).toHaveBeenCalledWith('removed-1');
  });

  it('no-ops when removed id has no cached revision', async () => {
    vi.mocked(readCachedRevision).mockResolvedValue(0);
    await migrateRevisionsOnIndexRepair(
      { projects: [{ id: 'removed-1', name: 'Alpha' }] },
      { projects: [{ id: 'kept-1', name: 'Alpha' }] },
      ['removed-1'],
    );
    expect(writeCachedRevision).not.toHaveBeenCalled();
  });
});
