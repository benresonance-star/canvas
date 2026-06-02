import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transferStagedToCanvas } from '../placementTransfer.js';
import {
  mergeLocalPlacementStateIntoDoc,
  patchPlacementsMapFromArrays,
  reconcileArtifactPlacements,
} from '../artifactPlacementsMap.js';
import { buildProjectSavePayload, normalizeLoadedProject } from '../persistence.js';
import { preserveCanvasCardsInMergedPayload } from '../sync/projectSyncDocument.js';
import { mergeProjectDocuments } from '../projectDocumentMerge.js';

vi.mock('../sync/projectSyncLocal.js', () => ({
  readLocalProjectSerialised: vi.fn(async () => null),
}));

vi.mock('../projectSync.js', () => ({
  cancelPendingProjectSave: vi.fn(),
  persistProjectDocumentLocally: vi.fn(async () => true),
  flushOutgoingProjectDocument: vi.fn(async () => ({ ok: true })),
  initializeProjectSync: vi.fn(),
}));

import { readLocalProjectSerialised } from '../sync/projectSyncLocal.js';
import { persistProjectDocumentLocally } from '../projectSync.js';
import {
  commitProjectDocument,
  resetProjectDocumentCommitForTests,
  setCommittedPayloadForTests,
} from '../projectDocumentCommit.js';

describe('placement persistence integration', () => {
  beforeEach(() => {
    resetProjectDocumentCommitForTests();
    vi.clearAllMocks();
  });

  it('dock→canvas transfer survives commit, IDB readback, and normalize load', async () => {
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
    ];
    const transfer = transferStagedToCanvas([], staged, 's1', 120, 80);
    expect(transfer.placed).toBe(true);
    expect(transfer.artifactPlacements?.notes__a?.surface).toBe('canvas');

    const state = {
      projectName: 'P',
      cards: transfer.cards,
      canvasView: { x: 0, y: 0, zoom: 1 },
    };

    let persistedRaw = null;
    persistProjectDocumentLocally.mockImplementation(async (_id, serialised) => {
      persistedRaw = serialised;
      return true;
    });

    await commitProjectDocument('p-int', {
      state,
      stagedSyncCards: transfer.stagedSyncCards,
      artifactPlacements: transfer.artifactPlacements,
      reason: 'placementTransfer:canvas',
    });

    expect(persistedRaw).toBeTruthy();
    readLocalProjectSerialised.mockResolvedValueOnce(persistedRaw);

    const loaded = JSON.parse(persistedRaw);
    const normalized = normalizeLoadedProject(loaded);
    expect(normalized.cards).toHaveLength(1);
    expect(normalized.stagedSyncCards).toHaveLength(0);
    expect(normalized.artifactPlacements?.notes__a?.surface).toBe('canvas');
    expect(normalized.cards[0].x).toBe(transfer.cards[0].x);
    expect(normalized.cards[0].y).toBe(transfer.cards[0].y);
  });

  it('pull merge keeps local canvas when server body is dock-only', () => {
    const serverDoc = {
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__a',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      ],
      artifactPlacements: {
        notes__a: { surface: 'dock' },
      },
    };
    const localDoc = {
      cards: [
        {
          id: 'c1',
          key: 'notes__a',
          type: 'markdown',
          x: 200,
          y: 300,
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      ],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: {
          surface: 'canvas',
          placement: { key: 'notes__a', x: 200, y: 300 },
          record: {
            id: 'c1',
            key: 'notes__a',
            type: 'markdown',
            x: 200,
            y: 300,
            versions: [{ version: 1, filename: 'notes__a-v1.md' }],
          },
        },
      },
      localEditAt: Date.now(),
    };

    const merged = mergeLocalPlacementStateIntoDoc(serverDoc, localDoc);
    const normalized = reconcileArtifactPlacements(merged);
    expect(normalized.cards).toHaveLength(1);
    expect(normalized.artifactPlacements?.notes__a?.surface).toBe('canvas');
    expect(normalized.cards[0].x).toBe(200);
  });

  it('outgoing switch commit keeps canvas when cache map is stale dock', async () => {
    const dockStaged = {
      stagingId: 's1',
      key: 'notes__a',
      type: 'markdown',
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const canvasCard = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 40,
      y: 50,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const staleCache = {
      notes__a: {
        surface: 'dock',
        record: dockStaged,
        placement: { key: 'notes__a' },
      },
    };
    setCommittedPayloadForTests('p-sw', {
      cards: [],
      stagedSyncCards: [dockStaged],
      artifactPlacements: staleCache,
    });

    let persistedRaw = null;
    persistProjectDocumentLocally.mockImplementation(async (_id, serialised) => {
      persistedRaw = serialised;
      return true;
    });

    const outgoingPlacements = patchPlacementsMapFromArrays(
      staleCache,
      [canvasCard],
      [],
    );
    await commitProjectDocument('p-sw', {
      state: {
        projectName: 'P',
        cards: [canvasCard],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      stagedSyncCards: [],
      artifactPlacements: outgoingPlacements,
      reason: 'projectSwitch:outgoing',
    });

    const loaded = JSON.parse(persistedRaw);
    expect(loaded.cards).toHaveLength(1);
    expect(loaded.stagedSyncCards).toHaveLength(0);
    expect(loaded.artifactPlacements.notes__a.surface).toBe('canvas');
  });

  it('switch-style flush keeps canvas when authoritative map overrides dock arrays', () => {
    const card = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 40,
      y: 50,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const authoritativePlacements = {
      notes__a: {
        surface: 'canvas',
        record: card,
        placement: { key: 'notes__a', x: 40, y: 50 },
      },
    };
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__a',
        type: 'markdown',
        versions: [{ version: 1, filename: 'notes__a-v1.md' }],
      },
    ];
    const payload = buildProjectSavePayload(
      { projectName: 'P', cards: [], canvasView: { x: 0, y: 0, zoom: 1 } },
      staged,
      [],
      { authoritativePlacements },
    );
    expect(payload.cards).toHaveLength(1);
    expect(payload.artifactPlacements.notes__a.surface).toBe('canvas');
  });

  it('mergeProjectDocuments adopts server canvas when local cache is dock-only (other browser)', () => {
    const localDoc = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__a', type: 'markdown', versions: [] },
        { stagingId: 's2', key: 'notes__b', type: 'markdown', versions: [] },
      ],
      artifactPlacements: {
        notes__a: { surface: 'dock' },
        notes__b: { surface: 'dock' },
      },
    };
    const serverDoc = {
      cards: [
        { id: 'c1', key: 'notes__a', type: 'markdown', x: 40, y: 50, versions: [] },
        { id: 'c2', key: 'notes__b', type: 'markdown', x: 120, y: 50, versions: [] },
      ],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas', placement: { key: 'notes__a', x: 40, y: 50 } },
        notes__b: { surface: 'canvas', placement: { key: 'notes__b', x: 120, y: 50 } },
      },
    };
    const { merged, decision } = mergeProjectDocuments(localDoc, serverDoc, {
      localEditAt: 0,
      serverAt: 2000,
      projectId: 'p-cross',
    });
    expect(decision).toBe('merged');
    expect(merged.cards).toHaveLength(2);
    expect(merged.stagedSyncCards).toHaveLength(0);
    expect(merged.artifactPlacements.notes__a.surface).toBe('canvas');
  });

  it('preserveCanvasCardsInMergedPayload patches map for local canvas', () => {
    const merged = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__a', type: 'markdown', versions: [] },
      ],
    };
    const localDoc = {
      cards: [{ id: 'c1', key: 'notes__a', type: 'markdown', x: 1, y: 2, versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas', placement: { key: 'notes__a', x: 1, y: 2 } },
      },
    };
    const out = preserveCanvasCardsInMergedPayload(merged, { localDoc, projectId: 'p1' });
    expect(out.cards).toHaveLength(1);
    expect(out.artifactPlacements.notes__a.surface).toBe('canvas');
  });
});
