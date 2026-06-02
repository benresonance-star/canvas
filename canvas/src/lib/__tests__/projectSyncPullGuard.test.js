import { describe, it, expect, beforeEach } from 'vitest';
import {
  preserveCanvasCardsInMergedPayload,
  recordGoodLocalCardCount,
  clearLastGoodLocalCardCount,
} from '../sync/projectSyncDocument.js';

describe('preserveCanvasCardsInMergedPayload', () => {
  beforeEach(() => {
    clearLastGoodLocalCardCount('p-guard');
  });

  it('returns merged unchanged when canvas has cards', () => {
    const merged = { cards: [{ id: 'c1' }], stagedSyncCards: [] };
    expect(preserveCanvasCardsInMergedPayload(merged, {})).toBe(merged);
  });

  it('preserves local canvas when merge is dock-only', () => {
    recordGoodLocalCardCount('p-guard', 3);
    const merged = {
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__a',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      ],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const localDoc = {
      cards: [
        {
          id: 'c1',
          key: 'notes__a',
          x: 100,
          y: 100,
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      ],
      stagedSyncCards: [],
    };
    const out = preserveCanvasCardsInMergedPayload(merged, {
      localDoc,
      projectId: 'p-guard',
    });
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].id).toBe('c1');
  });

  it('restores from dock when lastGood count but no local canvas', () => {
    recordGoodLocalCardCount('p-guard', 2);
    const merged = {
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__a',
          prefix: 'notes',
          name: 'A',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
          pinnedVersion: 1,
        },
      ],
    };
    const out = preserveCanvasCardsInMergedPayload(merged, {
      projectId: 'p-guard',
    });
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.stagedSyncCards).toHaveLength(0);
  });

  it('allows intentional dock-only when no local canvas history', () => {
    const merged = {
      cards: [],
      stagedSyncCards: [{ stagingId: 's1', key: 'notes__a' }],
    };
    const out = preserveCanvasCardsInMergedPayload(merged, {
      projectId: 'p-guard',
    });
    expect(out).toBe(merged);
  });
});
