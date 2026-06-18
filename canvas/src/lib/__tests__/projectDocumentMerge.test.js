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

  it('adopts an authoritative empty repair document over stale local artifacts', () => {
    const localDoc = {
      cards: [{ id: 'c1', key: 'stale' }],
      stagedSyncCards: [{ key: 'stale-dock' }],
    };
    const remoteDoc = {
      projectName: 'Repaired',
      cards: [],
      stagedSyncCards: [],
      artifactPlacements: {},
      identityRepair: {
        authoritativeEmpty: true,
        reason: 'project-folder-identity',
      },
    };

    const { decision, merged, skipWrite } = mergeProjectDocuments(localDoc, remoteDoc, {
      localEditAt: 1000,
      serverAt: 2000,
      projectId: 'p-repaired',
    });

    expect(decision).toBe('adoptedRemote');
    expect(skipWrite).toBe(false);
    expect(merged.cards).toEqual([]);
    expect(merged.stagedSyncCards).toEqual([]);
    expect(merged.identityRepair.authoritativeEmpty).toBe(true);
  });

  it('adopts an authoritative repair document with docked links over stale local artifacts', () => {
    const localDoc = {
      cards: [{ id: 'c1', key: 'stale' }],
      stagedSyncCards: [{ key: 'stale-dock' }],
    };
    const remoteDoc = {
      projectName: 'Repaired',
      cards: [],
      stagedSyncCards: [{
        key: 'links__example-com',
        name: 'example.com',
        type: 'bookmark',
        versions: [{ version: 1, externalUrl: 'https://example.com' }],
      }],
      artifactPlacements: {
        'links__example-com': { surface: 'dock' },
      },
      identityRepair: {
        authoritative: true,
        reason: 'project-folder-identity',
      },
    };

    const { decision, merged, skipWrite } = mergeProjectDocuments(localDoc, remoteDoc, {
      localEditAt: 1000,
      serverAt: 2000,
      projectId: 'p-repaired-links',
    });

    expect(decision).toBe('adoptedRemote');
    expect(skipWrite).toBe(false);
    expect(merged.cards).toEqual([]);
    expect(merged.stagedSyncCards).toHaveLength(1);
    expect(merged.stagedSyncCards[0].key).toBe('links__example-com');
  });

  it('skips write when merge would drop dock-only artifacts', () => {
    const localDoc = {
      cards: [],
      stagedSyncCards: [{ stagingId: 's1', key: 'notes__dock' }],
      artifactPlacements: {
        'notes__dock': { surface: 'dock' },
      },
    };
    const remoteDoc = { cards: [], stagedSyncCards: [], artifactPlacements: {} };

    const { skipWrite, merged, decision } = mergeProjectDocuments(
      localDoc,
      remoteDoc,
      {
        localEditAt: 100,
        serverAt: 200,
        projectId: 'p-dock',
      },
    );

    expect(skipWrite).toBe(true);
    expect(decision).toBe('keptLocal');
    expect(merged.stagedSyncCards).toHaveLength(1);
  });

  it('adopts populated server document when local cache is empty but newer', () => {
    const localDoc = {
      projectName: 'Local Empty',
      cards: [],
      stagedSyncCards: [],
      artifactPlacements: {},
    };
    const remoteDoc = {
      projectName: 'Server Populated',
      cards: [{ id: 'c1', key: 'aps-playbook' }],
      stagedSyncCards: [{ stagingId: 's1', key: 'operations-playbook' }],
      artifactPlacements: {
        'aps-playbook': { surface: 'canvas' },
        'operations-playbook': { surface: 'dock' },
      },
    };

    const { merged, decision, skipWrite } = mergeProjectDocuments(
      localDoc,
      remoteDoc,
      {
        localEditAt: 2000,
        serverAt: 1000,
        projectId: 'p-empty-local',
      },
    );

    expect(skipWrite).toBe(false);
    expect(decision).toBe('merged');
    expect(merged.cards).toHaveLength(1);
    expect(merged.stagedSyncCards).toHaveLength(1);
  });
});

describe('shouldSkipInboundReconcileAfterLocalCommit', () => {
  it('returns true when local has more canvas cards than server snapshot', () => {
    const local = { cards: [{ id: 'a' }, { id: 'b' }], stagedSyncCards: [] };
    const server = { cards: [], stagedSyncCards: [{ key: 'x' }] };
    expect(shouldSkipInboundReconcileAfterLocalCommit(local, server)).toBe(true);
  });

  it('returns true when local has dock-only artifacts and server is empty', () => {
    const local = { cards: [], stagedSyncCards: [{ key: 'notes__dock' }] };
    const server = { cards: [], stagedSyncCards: [] };
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
