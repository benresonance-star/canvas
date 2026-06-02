import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../canvasProjectsApi.js', () => ({
  patchCanvasProject: vi.fn(async () => ({
    ok: true,
    revision: 2,
    updatedAt: '2020-01-01T00:00:00.000Z',
  })),
}));

vi.mock('../syncGate.js', () => ({
  runSyncGate: (_label, fn) => fn(),
}));

vi.mock('../sync/projectSyncState.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    getServerSyncEnabled: () => true,
  };
});

vi.mock('../sync/projectSyncLocal.js', () => ({
  writeLocalProjectSerialised: vi.fn(async () => true),
}));

vi.mock('../sync/projectSyncIndex.js', () => ({
  patchIndexDocumentRevision: vi.fn(async () => {}),
}));

vi.mock('../sync/projectSyncRevision.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    alignClientRevisionWithServerMeta: vi.fn(async () => {}),
    ensureClientRevision: vi.fn(async () => {}),
    getClientRevision: vi.fn(() => 1),
    applyServerProjectRevision: vi.fn(),
    notifySyncLock: vi.fn(),
  };
});

describe('pushProjectPatchIfEnabled', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetProjectDocumentCommitForTests } = await import(
      '../projectDocumentCommit.js'
    );
    resetProjectDocumentCommitForTests();
    const { resetProjectSyncState } = await import('../projectSync.js');
    resetProjectSyncState();
  });

  it('diffs against prior snapshot after commit, not the post-commit cache', async () => {
    const { patchCanvasProject } = await import('../canvasProjectsApi.js');
    const {
      setCommittedPayloadForTests,
      commitProjectDocument,
    } = await import('../projectDocumentCommit.js');
    const { pushProjectPatchIfEnabled } = await import(
      '../sync/projectSyncPatch.js'
    );

    const before = {
      projectName: 'P',
      cards: [],
      stagedSyncCards: [],
      artifactPlacements: {},
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    setCommittedPayloadForTests('p-prior', before);

    const after = {
      ...before,
      cards: [
        {
          id: 'c1',
          key: 'notes__a',
          type: 'markdown',
          x: 10,
          y: 20,
          versions: [],
        },
      ],
      artifactPlacements: {
        notes__a: {
          surface: 'canvas',
          ref: { id: 'c1', key: 'notes__a' },
        },
      },
    };

    await commitProjectDocument('p-prior', {
      state: { projectName: 'P', cards: after.cards, canvasView: before.canvasView },
      stagedSyncCards: [],
      artifactPlacements: after.artifactPlacements,
      reason: 'test',
      pushRemote: false,
    });

    const result = await pushProjectPatchIfEnabled(
      'p-prior',
      after,
      'structuralChange',
    );
    expect(result?.ok).toBe(true);
    expect(patchCanvasProject).toHaveBeenCalled();
    const call = patchCanvasProject.mock.calls[0][1];
    expect(call.ops.some((o) => o.op === 'upsertCard')).toBe(true);
  });
});
