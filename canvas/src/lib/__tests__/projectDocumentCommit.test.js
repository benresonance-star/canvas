import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sync/projectSyncLocal.js', () => ({
  readLocalProjectSerialised: vi.fn(async () => null),
}));

vi.mock('../projectSync.js', () => ({
  cancelPendingProjectSave: vi.fn(),
  persistProjectDocumentLocally: vi.fn(async () => true),
  flushOutgoingProjectDocument: vi.fn(async () => ({ ok: true })),
  isServerSyncEnabled: vi.fn(() => false),
}));

import { readLocalProjectSerialised } from '../sync/projectSyncLocal.js';
import { persistProjectDocumentLocally } from '../projectSync.js';
import {
  commitProjectDocument,
  getCommittedPayload,
  resetProjectDocumentCommitForTests,
} from '../projectDocumentCommit.js';

describe('projectDocumentCommit', () => {
  beforeEach(() => {
    resetProjectDocumentCommitForTests();
    vi.clearAllMocks();
  });

  it('persists authoritative placement map from transfer', async () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(1000)}`;
    const state = {
      projectName: 'P',
      cards: [
        {
          id: 'c1',
          key: 'notes__a',
          type: 'markdown',
          x: 10,
          y: 20,
          versions: [{
            version: 1,
            filename: 'notes__a-v1.md',
            dataUrl,
            previewCacheKey: 'p:notes__a:v1',
          }],
        },
      ],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const artifactPlacements = {
      notes__a: {
        surface: 'canvas',
        record: state.cards[0],
        placement: { id: 'c1', key: 'notes__a', x: 10, y: 20 },
      },
    };

    const result = await commitProjectDocument('p1', {
      state,
      stagedSyncCards: [],
      artifactPlacements,
      reason: 'placementTransfer:canvas',
    });

    expect(result.ok).toBe(true);
    expect(persistProjectDocumentLocally).toHaveBeenCalled();
    const cached = getCommittedPayload('p1');
    expect(cached?.artifactPlacements?.notes__a?.surface).toBe('canvas');
    expect(cached?.artifactPlacements?.notes__a?.record).toBeUndefined();
    expect(cached?.cards?.[0]?.versions?.[0]?.dataUrl).toBeNull();
    expect(cached?.cards).toHaveLength(1);
  });

  it('does not resurrect stale local dock rows when current dock is empty', async () => {
    const localDoc = {
      projectName: 'P',
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__b',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__b-v1.md' }],
        },
      ],
      artifactPlacements: {
        notes__b: {
          surface: 'dock',
          record: {
            stagingId: 's1',
            key: 'notes__b',
            type: 'markdown',
            versions: [{ version: 1, filename: 'notes__b-v1.md' }],
          },
        },
        notes__a: {
          surface: 'canvas',
          record: {
            id: 'c1',
            key: 'notes__a',
            type: 'markdown',
            versions: [{ version: 1, filename: 'notes__a-v1.md' }],
          },
        },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    readLocalProjectSerialised.mockResolvedValueOnce(JSON.stringify(localDoc));

    const state = {
      projectName: 'P',
      cards: [
        {
          id: 'c1',
          key: 'notes__a',
          type: 'markdown',
          x: 5,
          y: 6,
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      ],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };

    await commitProjectDocument('p1', {
      state,
      stagedSyncCards: [],
      reason: 'layoutCommit',
    });

    const cached = getCommittedPayload('p1');
    expect(cached?.artifactPlacements?.notes__a?.surface).toBe('canvas');
    expect(cached?.artifactPlacements?.notes__b).toBeUndefined();
    expect(cached?.stagedSyncCards).toEqual([]);
  });

  it('falls back to local dock rows only when staged rows are omitted', async () => {
    const localDoc = {
      projectName: 'P',
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__b',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__b-v1.md' }],
        },
      ],
      artifactPlacements: {
        notes__b: {
          surface: 'dock',
          record: {
            stagingId: 's1',
            key: 'notes__b',
            type: 'markdown',
            versions: [{ version: 1, filename: 'notes__b-v1.md' }],
          },
        },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    readLocalProjectSerialised.mockResolvedValue(JSON.stringify(localDoc));

    await commitProjectDocument('p1', {
      state: {
        projectName: 'P',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      reason: 'legacyCommit',
    });

    const cached = getCommittedPayload('p1');
    expect(cached?.stagedSyncCards).toHaveLength(1);
    expect(cached?.artifactPlacements?.notes__b?.surface).toBe('dock');
  });

  it('patches stale authoritative dock map from runtime canvas arrays', async () => {
    const card = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 1,
      y: 2,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const stalePlacements = {
      notes__a: {
        surface: 'dock',
        record: {
          stagingId: 's1',
          key: 'notes__a',
          type: 'markdown',
          versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        },
      },
    };

    await commitProjectDocument('p1', {
      state: {
        projectName: 'P',
        cards: [card],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      stagedSyncCards: [],
      artifactPlacements: stalePlacements,
      reason: 'projectSwitch:outgoing',
    });

    const cached = getCommittedPayload('p1');
    expect(cached?.cards).toHaveLength(1);
    expect(cached?.artifactPlacements?.notes__a?.surface).toBe('canvas');
  });
});
