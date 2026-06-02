import { describe, it, expect } from 'vitest';
import {
  clearManualSyncSpinnerFlags,
  buildManualSyncSuccessMessage,
} from '../sync/manualSync.js';
import { shouldWriteThroughSpecCanvas } from '../structure/canvasWriteThrough.js';

describe('manualSync helpers', () => {
  const strings = {
    sync: {
      syncComplete: 'Sync finished.',
      serverDocumentMissing: 'No server document.',
      syncedFromServerRevision: (r) => `Synced rev ${r}`,
      alreadySyncedRevision: (r) => `Up to date rev ${r}`,
      nothingNew: 'Nothing new',
      previewsRestored: 'Previews restored',
    },
    projects: {
      syncedFromServer: 'Synced from server',
      alreadySyncedFromServer: 'Already synced',
    },
  };

  it('clearManualSyncSpinnerFlags removes spinner fields', () => {
    expect(
      clearManualSyncSpinnerFlags({
        manualSyncing: true,
        banner: 'x',
        scanning: true,
        noChanges: true,
      }),
    ).toEqual({ noChanges: true });
  });

  it('buildManualSyncSuccessMessage reports missing server document', () => {
    expect(
      buildManualSyncSuccessMessage(strings, {
        missingServerDocument: true,
        serverSyncEnabled: true,
      }),
    ).toBe('No server document.');
  });

  it('buildManualSyncSuccessMessage includes revision when pulled', () => {
    expect(
      buildManualSyncSuccessMessage(strings, {
        pulled: true,
        revision: 3,
      }),
    ).toBe('Synced rev 3');
  });
});

describe('canvasWriteThrough', () => {
  it('enables write-through for layout and placement reasons', () => {
    expect(shouldWriteThroughSpecCanvas('layoutCommit')).toBe(true);
    expect(shouldWriteThroughSpecCanvas('placementTransfer')).toBe(true);
    expect(shouldWriteThroughSpecCanvas('commit:layoutCommit')).toBe(true);
    expect(shouldWriteThroughSpecCanvas('random')).toBe(false);
  });
});
