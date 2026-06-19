import { describe, it, expect, vi, beforeEach } from 'vitest';

const revisionMockState = vi.hoisted(() => ({ clientRev: 1 }));

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
    getClientRevision: vi.fn(() => revisionMockState.clientRev),
    applyServerProjectRevision: vi.fn((_projectId, _updatedAt, revision) => {
      revisionMockState.clientRev = Number(revision) || 0;
    }),
    notifySyncLock: vi.fn(),
  };
});

describe('pushProjectPatchIfEnabled', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    revisionMockState.clientRev = 1;
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

  it('retries layout-only patch conflicts with the server revision from 409', async () => {
    const { patchCanvasProject } = await import('../canvasProjectsApi.js');
    const {
      setCommittedPayloadForTests,
    } = await import('../projectDocumentCommit.js');
    const { pushProjectPatchIfEnabled } = await import(
      '../sync/projectSyncPatch.js'
    );

    const before = {
      projectName: 'P',
      cards: [{
        id: 'c1',
        key: 'notes__a',
        type: 'markdown',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        versions: [],
      }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas', ref: { id: 'c1', key: 'notes__a' } },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const after = {
      ...before,
      cards: [{
        ...before.cards[0],
        x: 120,
        y: 160,
        width: 420,
        height: 260,
      }],
    };
    setCommittedPayloadForTests('p-layout-conflict', before);
    patchCanvasProject
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        revision: 2,
        updatedAt: '2025-06-15T00:00:10.000Z',
        payload: before,
      })
      .mockResolvedValueOnce({
        ok: true,
        revision: 3,
        updatedAt: '2025-06-15T00:00:11.000Z',
      });

    const result = await pushProjectPatchIfEnabled(
      'p-layout-conflict',
      after,
      'layoutCommit',
    );

    expect(result?.ok).toBe(true);
    expect(patchCanvasProject).toHaveBeenCalledTimes(2);
    expect(patchCanvasProject.mock.calls[1][1]).toMatchObject({
      expectedRevision: 2,
    });
    expect(
      patchCanvasProject.mock.calls[1][1].ops.some((op) =>
        op.op === 'setCardLayout'
        && op.id === 'c1'
        && op.width === 420
        && op.height === 260,
      ),
    ).toBe(true);
  });

  it('retries cleanup removals instead of adopting larger server payload', async () => {
    const { patchCanvasProject } = await import('../canvasProjectsApi.js');
    const { setCommittedPayloadForTests } = await import('../projectDocumentCommit.js');
    const { writeLocalProjectSerialised } = await import('../sync/projectSyncLocal.js');
    const { pushProjectPatchIfEnabled } = await import(
      '../sync/projectSyncPatch.js'
    );

    const before = {
      projectName: 'P',
      cards: [
        { id: 'keep-card', key: 'notes__keep', type: 'markdown', versions: [] },
        {
          id: 'stale-card',
          key: 'notes__agent-chat-openai-stale',
          type: 'agent_chat',
          versions: [{ filename: 'notes__agent-chat-openai-stale-v1.md' }],
        },
      ],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__keep: { surface: 'canvas', ref: { id: 'keep-card', key: 'notes__keep' } },
        'notes__agent-chat-openai-stale': {
          surface: 'canvas',
          ref: { id: 'stale-card', key: 'notes__agent-chat-openai-stale' },
        },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const after = {
      ...before,
      cards: [before.cards[0]],
      artifactPlacements: {
        notes__keep: before.artifactPlacements.notes__keep,
      },
    };
    setCommittedPayloadForTests('p-cleanup-conflict', before);
    patchCanvasProject
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        revision: 2,
        updatedAt: '2025-06-15T00:00:10.000Z',
        payload: before,
      })
      .mockResolvedValueOnce({
        ok: true,
        revision: 3,
        updatedAt: '2025-06-15T00:00:11.000Z',
      });

    const result = await pushProjectPatchIfEnabled(
      'p-cleanup-conflict',
      after,
      'structuralChange',
      before,
      null,
      false,
      false,
      true,
    );

    expect(result?.ok).toBe(true);
    expect(patchCanvasProject).toHaveBeenCalledTimes(2);
    expect(writeLocalProjectSerialised).toHaveBeenLastCalledWith(
      'p-cleanup-conflict',
      expect.stringContaining('"keep-card"'),
    );
    expect(writeLocalProjectSerialised).not.toHaveBeenCalledWith(
      'p-cleanup-conflict',
      expect.stringContaining('"stale-card"'),
    );
    expect(
      patchCanvasProject.mock.calls[1][1].ops.some((op) =>
        op.op === 'removeCard' && op.id === 'stale-card',
      ),
    ).toBe(true);
  });
});
