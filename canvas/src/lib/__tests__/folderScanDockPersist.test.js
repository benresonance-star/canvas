import { describe, it, expect } from 'vitest';
import { dockPersistAheadOfCommit } from '../folderScanDockPersist.js';

describe('dockPersistAheadOfCommit', () => {
  it('returns false when live and committed dock match', () => {
    const staged = [{ stagingId: 's1', key: 'html__page' }];
    expect(
      dockPersistAheadOfCommit(staged, { stagedSyncCards: staged }),
    ).toBe(false);
  });

  it('returns true when live dock has more rows than committed', () => {
    const live = [
      { stagingId: 's1', key: 'html__page' },
      { stagingId: 's2', key: 'images__photo' },
    ];
    expect(
      dockPersistAheadOfCommit(live, { stagedSyncCards: [] }),
    ).toBe(true);
  });

  it('returns true when live has unsaved rows with new staging ids', () => {
    const live = [
      { stagingId: 's1', key: 'html__page' },
      { stagingId: 's-new', key: 'images__photo' },
    ];
    expect(
      dockPersistAheadOfCommit(live, {
        stagedSyncCards: [{ stagingId: 's1', key: 'html__page' }],
      }),
    ).toBe(true);
  });
});
