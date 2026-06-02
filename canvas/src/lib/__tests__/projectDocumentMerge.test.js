import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeProjectDocuments,
  preserveCanvasCardsInMergedPayload,
  shouldSkipInboundReconcileAfterLocalCommit,
  clearLastGoodLocalCardCount,
  recordGoodLocalCardCount,
} from '../projectDocumentMerge.js';

describe('mergeProjectDocuments', () => {
  it('keeps local canvas when server is dock-only and revision is newer on server', () => {
    const localDoc = {
      cards: [{ id: 'c1', key: 'notes__a', x: 1, y: 2 }],
      stagedSyncCards: [],
      artifactPlacements: {
        'notes__a': { surface: 'canvas', placement: { x: 1, y: 2 } },
      },
    };
    const remoteDoc = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__a', type: 'markdown' },
      ],
      artifactPlacements: {
        'notes__a': { surface: 'dock' },
      },
    };
    const { merged, decision, skipWrite } = mergeProjectDocuments(
      localDoc,
      remoteDoc,
      {
        localEditAt: 0,
        serverAt: 1000,
        projectId: 'p1',
      },
    );
    expect(skipWrite).toBe(false);
    expect(decision).toBe('keptLocal');
    expect(merged.cards).toHaveLength(1);
  });

  it('skips write when merge would regress canvas count', () => {
    const localDoc = {
      cards: [{ id: 'c1' }, { id: 'c2' }],
      stagedSyncCards: [],
    };
    const remoteDoc = { cards: [], stagedSyncCards: [] };
    const { skipWrite, merged } = mergeProjectDocuments(localDoc, remoteDoc, {
      localEditAt: 100,
      serverAt: 200,
      projectId: 'p2',
    });
    expect(skipWrite).toBe(true);
    expect(merged.cards).toHaveLength(2);
  });
});

describe('shouldSkipInboundReconcileAfterLocalCommit', () => {
  it('returns true when local has more canvas cards than server snapshot', () => {
    const local = { cards: [{ id: 'a' }, { id: 'b' }], stagedSyncCards: [] };
    const server = { cards: [], stagedSyncCards: [{ key: 'x' }] };
    expect(shouldSkipInboundReconcileAfterLocalCommit(local, server)).toBe(true);
  });
});

describe('preserveCanvasCardsInMergedPayload', () => {
  beforeEach(() => {
    clearLastGoodLocalCardCount('p-guard');
  });

  it('preserves local canvas when merge is dock-only', () => {
    recordGoodLocalCardCount('p-guard', 1);
    const merged = { cards: [], stagedSyncCards: [{ key: 'notes__a' }] };
    const localDoc = {
      cards: [{ id: 'c1', key: 'notes__a' }],
      stagedSyncCards: [],
    };
    const out = preserveCanvasCardsInMergedPayload(merged, {
      localDoc,
      projectId: 'p-guard',
    });
    expect(out.cards).toHaveLength(1);
  });
});
