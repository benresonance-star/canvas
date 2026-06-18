import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyProjectOps } from '../sync/projectPatchOps.js';

vi.mock('../canvasProjectsApi.js', () => ({
  patchCanvasProject: vi.fn(async () => ({
    ok: true,
    revision: 2,
    updatedAt: '2026-06-18T00:00:00.000Z',
  })),
}));

vi.mock('../sync/projectSyncLocal.js', () => ({
  readLocalProjectSerialised: vi.fn(async () => null),
  writeLocalProjectSerialised: vi.fn(async () => true),
  getLastKnownProjectPayloadById: () => new Map(),
}));

vi.mock('../sync/projectSyncState.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    getServerSyncEnabled: vi.fn(() => true),
  };
});

vi.mock('../sync/projectSyncRevision.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    ensureClientRevision: vi.fn(async () => 0),
    getClientRevision: vi.fn(() => 0),
    applyServerProjectRevision: vi.fn(),
    notifySyncLock: vi.fn(),
    alignClientRevisionWithServerMeta: vi.fn(async () => 0),
  };
});

vi.mock('../sync/projectSyncIndex.js', () => ({
  patchIndexDocumentRevision: vi.fn(async () => true),
}));

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

  it('placementTransfer PATCH runs inside the existing placement gate', async () => {
    const { patchCanvasProject } = await import('../canvasProjectsApi.js');
    const { runSyncGate, resetSyncGateForTests } = await import('../syncGate.js');
    const { pushProjectPatchIfEnabled } = await import('../sync/projectSyncPatch.js');
    resetSyncGateForTests();

    const before = {
      projectName: 'P',
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'aps-playbook',
          type: 'html',
          versions: [{ version: 1, filename: 'aps-playbook.html' }],
        },
      ],
      artifactPlacements: {
        'aps-playbook': {
          surface: 'dock',
          placement: { stagingId: 's1', key: 'aps-playbook', type: 'html' },
        },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const after = {
      ...before,
      cards: [
        {
          id: 'c-html',
          key: 'aps-playbook',
          name: 'aps-playbook',
          type: 'html',
          x: 10,
          y: 20,
          versions: [{ version: 1, filename: 'aps-playbook.html' }],
        },
      ],
      stagedSyncCards: [],
      artifactPlacements: {
        'aps-playbook': {
          surface: 'canvas',
          placement: {
            id: 'c-html',
            key: 'aps-playbook',
            type: 'html',
            x: 10,
            y: 20,
          },
        },
      },
    };

    const result = await runSyncGate(
      'action:placementTransfer',
      () => pushProjectPatchIfEnabled(
        'p-placement',
        after,
        'placementTransfer',
        before,
      ),
      { scope: 'project:p-placement' },
    );

    expect(result?.ok).toBe(true);
    expect(patchCanvasProject).toHaveBeenCalledWith(
      'p-placement',
      expect.objectContaining({
        ops: expect.arrayContaining([
          expect.objectContaining({ op: 'upsertCard' }),
          expect.objectContaining({
            op: 'setPlacement',
            key: 'aps-playbook',
            surface: 'canvas',
          }),
          expect.objectContaining({ op: 'removeStaged', stagingId: 's1' }),
        ]),
      }),
    );
  });
});
