import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyProjectOps } from '../sync/projectPatchOps.js';

vi.mock('../sync/projectSyncLocal.js', () => ({
  readLocalProjectSerialised: vi.fn(async () => null),
  writeLocalProjectSerialised: vi.fn(async () => true),
  getLastKnownProjectPayloadById: () => new Map(),
}));

vi.mock('../sync/projectSyncRevision.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    getClientRevision: vi.fn(() => 0),
    applyServerProjectRevision: vi.fn(),
  };
});

describe('projectSyncPatch integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dock→canvas ops produce canvas membership on server-shaped doc', () => {
    const serverDoc = {
      projectName: 'P',
      canvasView: { x: 0, y: 0, zoom: 1 },
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__dock',
          type: 'user_note',
          versions: [{ version: 1, content: 'x' }],
        },
      ],
      artifactPlacements: {
        notes__dock: { surface: 'dock', ref: { stagingId: 's1' } },
      },
    };

    const card = {
      id: 'c2',
      key: 'notes__dock',
      type: 'user_note',
      x: 40,
      y: 40,
      versions: [{ version: 1, content: 'x' }],
    };
    const browserA = applyProjectOps(serverDoc, [
      { op: 'setPlacement', key: 'notes__dock', surface: 'canvas', ref: card },
      { op: 'removeStaged', stagingId: 's1' },
    ]);

    expect(browserA.cards.some((c) => c.key === 'notes__dock')).toBe(true);
    expect(browserA.stagedSyncCards.every((s) => s.stagingId !== 's1')).toBe(true);
    expect(
      Object.values(browserA.artifactPlacements ?? {}).some((e) => e?.surface === 'canvas'),
    ).toBe(true);
  });

  it('applyRemoteProjectPatch adopts when server revision is ahead', async () => {
    const { readLocalProjectSerialised } = await import('../sync/projectSyncLocal.js');
    readLocalProjectSerialised.mockResolvedValueOnce(
      JSON.stringify({
        projectName: 'P',
        cards: [],
        stagedSyncCards: [
          {
            stagingId: 's1',
            key: 'notes__dock',
            type: 'user_note',
            versions: [{ version: 1, content: 'x' }],
          },
        ],
        canvasView: { x: 0, y: 0, zoom: 1 },
        artifactPlacements: {
          notes__dock: { surface: 'dock' },
        },
      }),
    );

    const { applyRemoteProjectPatch, resetProjectSyncRemoteApplyForTests } =
      await import('../sync/projectSyncRemoteApply.js');
    resetProjectSyncRemoteApplyForTests();

    const result = await applyRemoteProjectPatch(
      'p-int',
      [
        {
          op: 'setPlacement',
          key: 'notes__dock',
          surface: 'canvas',
          ref: {
            id: 'c2',
            key: 'notes__dock',
            type: 'user_note',
            x: 1,
            y: 2,
            versions: [{ version: 1, content: 'x' }],
          },
        },
        { op: 'removeStaged', stagingId: 's1' },
      ],
      2,
      { clientId: 'remote-tab', localClientId: 'local-tab' },
    );

    expect(result.applied).toBe(true);
    expect(result.payload?.cards?.some((c) => c.key === 'notes__dock')).toBe(true);
  });
});
