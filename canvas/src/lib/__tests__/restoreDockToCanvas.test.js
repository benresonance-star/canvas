import { describe, it, expect } from 'vitest';
import {
  restoreAllStagedToCanvas,
  buildPayloadAfterDockRestore,
} from '../restoreDockToCanvas.js';

describe('restoreDockToCanvas', () => {
  it('restoreAllStagedToCanvas places staged rows on canvas', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__a',
        prefix: 'notes',
        name: 'A',
        type: 'markdown',
        versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        pinnedVersion: 1,
      },
      {
        stagingId: 's2',
        key: 'img__b',
        prefix: 'img',
        name: 'B',
        type: 'image',
        versions: [{ version: 1, filename: 'img__b-v1.png' }],
        pinnedVersion: 1,
      },
    ];
    const { cards, stagedSyncCards, restored } = restoreAllStagedToCanvas([], staged);
    expect(restored).toBe(2);
    expect(cards).toHaveLength(2);
    expect(stagedSyncCards).toHaveLength(0);
    expect(cards[0].key).toBe('notes__a');
    expect(cards[1].key).toBe('img__b');
  });

  it('buildPayloadAfterDockRestore updates artifactPlacements', () => {
    const { payload, restored } = buildPayloadAfterDockRestore(
      { cards: [], projectName: 'P' },
      [
        {
          stagingId: 's1',
          key: 'notes__x',
          prefix: 'notes',
          name: 'X',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__x-v1.md' }],
          pinnedVersion: 1,
        },
      ],
    );
    expect(restored).toBe(1);
    expect(payload.cards).toHaveLength(1);
    expect(payload.stagedSyncCards).toHaveLength(0);
    expect(payload.artifactPlacements?.notes__x?.surface).toBe('canvas');
  });
});
