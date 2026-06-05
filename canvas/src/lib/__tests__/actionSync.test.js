import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../projectSync.js', () => ({
  cancelPendingProjectSave: vi.fn(),
  persistProjectDocumentLocally: vi.fn(async () => true),
  flushOutgoingProjectDocument: vi.fn(async () => ({ ok: true })),
  isServerSyncEnabled: vi.fn(() => true),
  reconcileActiveProject: vi.fn(async () => ({ pulled: false })),
}));

import {
  registerActionSyncHandlers,
  unregisterActionSyncHandlers,
  requestActionSync,
  resetActionSyncForTests,
} from '../actionSync.js';
import { beginCanvasInteraction, resetCanvasInteractionForTests } from '../canvasInteraction.js';
import { flushOutgoingProjectDocument } from '../projectSync.js';

describe('actionSync', () => {
  beforeEach(() => {
    resetActionSyncForTests();
    resetCanvasInteractionForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    unregisterActionSyncHandlers();
  });

  it('layoutCommit flushes local and push without reconcile pull', async () => {
    const flush = vi.fn();
    const reconcile = vi.fn();
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ projectName: 'P', cards: [], canvasView: { x: 0, y: 0, zoom: 1 } }),
      getStagedSyncCards: () => [],
      buildPayload: (s) => s,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: reconcile,
      flushAll: flush,
    });

    await requestActionSync('layoutCommit', { projectId: 'p1' });

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('boot flushes without reconcile pull', async () => {
    const reconcile = vi.fn();
    const flushActive = vi.fn(async () => {});
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ cards: [] }),
      getStagedSyncCards: () => [],
      buildPayload: (s) => s,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: reconcile,
      flushActiveProject: flushActive,
      flushAll: vi.fn(),
    });

    await requestActionSync('boot', { projectId: 'p1' });
    expect(flushActive).toHaveBeenCalledWith('p1');
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('visibilityResume flushes active project before reconcile', async () => {
    const flushActive = vi.fn(async () => {});
    const reconcile = vi.fn(async () => ({}));
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ cards: [] }),
      getStagedSyncCards: () => [],
      buildPayload: (s) => s,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: reconcile,
      flushActiveProject: flushActive,
      flushAll: vi.fn(),
    });

    await requestActionSync('visibilityResume', { projectId: 'p1' });
    expect(flushActive).toHaveBeenCalledWith('p1');
    expect(reconcile).toHaveBeenCalled();
  });

  it('visibilityResume skipped during active interaction', async () => {
    const reconcile = vi.fn();
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ cards: [] }),
      getStagedSyncCards: () => [],
      buildPayload: (s) => s,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: reconcile,
      flushAll: vi.fn(),
    });

    beginCanvasInteraction('card');
    await requestActionSync('visibilityResume', { projectId: 'p1' });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('structuralChange with awaitLocal persists before push', async () => {
    const { persistProjectDocumentLocally } = await import('../projectSync.js');
    let pushCalled = false;
    flushOutgoingProjectDocument.mockImplementation(async () => {
      pushCalled = true;
      return { ok: true };
    });

    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ cards: [], canvasView: { x: 0, y: 0, zoom: 1 } }),
      getStagedSyncCards: () => [{ stagingId: 's1', key: 'notes__a', versions: [] }],
      buildPayload: (s, staged) => ({ ...s, stagedSyncCards: staged }),
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: vi.fn(),
      flushAll: vi.fn(),
    });

    await requestActionSync('structuralChange', { projectId: 'p1', awaitLocal: true });
    expect(persistProjectDocumentLocally).toHaveBeenCalled();
    expect(pushCalled).toBe(true);
  });

  it('structuralChange notifies when server push fails', async () => {
    flushOutgoingProjectDocument.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      reason: 'server_newer',
    });
    const onStructuralPushFailed = vi.fn();
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({ cards: [], canvasView: { x: 0, y: 0, zoom: 1 } }),
      getStagedSyncCards: () => [{ stagingId: 's1', key: 'notes__a', versions: [] }],
      buildPayload: (s, staged) => ({ ...s, stagedSyncCards: staged }),
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      onStructuralPushFailed,
      reconcileInbound: vi.fn(),
      flushAll: vi.fn(),
    });

    await requestActionSync('structuralChange', { projectId: 'p1' });
    expect(onStructuralPushFailed).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ conflict: true }),
    );
  });

  it('placementTransfer pushes committed payload without re-persist', async () => {
    const { persistProjectDocumentLocally } = await import('../projectSync.js');
    const {
      setCommittedPayloadForTests,
      resetProjectDocumentCommitForTests,
    } = await import('../projectDocumentCommit.js');
    resetProjectDocumentCommitForTests();
    let pushCalled = false;
    flushOutgoingProjectDocument.mockImplementation(async () => {
      pushCalled = true;
      return { ok: true };
    });

    const payload = {
      projectName: 'P',
      cards: [{ id: 'c1', key: 'notes__a', type: 'markdown', versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas', record: { id: 'c1', key: 'notes__a' } },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    setCommittedPayloadForTests('p1', payload);

    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({
        cards: payload.cards,
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
      getStagedSyncCards: () => [],
      buildPayload: (s, staged) => ({ ...s, stagedSyncCards: staged }),
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: vi.fn(),
      flushAll: vi.fn(),
    });

    const { requestPlacementSync } = await import('../actionSync.js');
    await requestPlacementSync({ projectId: 'p1' });
    expect(persistProjectDocumentLocally).not.toHaveBeenCalled();
    expect(pushCalled).toBe(true);
    expect(flushOutgoingProjectDocument).toHaveBeenCalledWith('p1', payload, {
      reason: 'placementTransfer',
      traceId: null,
      beforePayload: null,
    });
  });

  it('placementTransfer waits for the server push before resolving', async () => {
    const {
      setCommittedPayloadForTests,
      resetProjectDocumentCommitForTests,
    } = await import('../projectDocumentCommit.js');
    resetProjectDocumentCommitForTests();
    let resolvePush;
    let pushSettled = false;
    flushOutgoingProjectDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePush = () => {
            pushSettled = true;
            resolve({ ok: true });
          };
        }),
    );

    const payload = {
      projectName: 'P',
      cards: [{ id: 'c1', key: 'notes__a', type: 'markdown', versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas', record: { id: 'c1', key: 'notes__a' } },
      },
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    setCommittedPayloadForTests('p1', payload);

    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({
        cards: payload.cards,
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
      getStagedSyncCards: () => [],
      buildPayload: (s, staged) => ({ ...s, stagedSyncCards: staged }),
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: vi.fn(),
      flushAll: vi.fn(),
    });

    const { requestPlacementSync } = await import('../actionSync.js');
    let resolved = false;
    const pending = requestPlacementSync({ projectId: 'p1' }).then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(pushSettled).toBe(false);

    resolvePush();
    await pending;

    expect(resolved).toBe(true);
    expect(pushSettled).toBe(true);
  });

  it('folderScan persists via commitProjectDocument handler', async () => {
    const commitProjectDocument = vi.fn(async () => ({
      ok: true,
      localCacheWritten: true,
      payload: {
        cards: [{ id: 'c1', key: 'notes__a' }],
        stagedSyncCards: [],
        artifactPlacements: {},
      },
    }));
    const reconcile = vi.fn(async () => ({}));
    registerActionSyncHandlers({
      getProjectId: () => 'p1',
      getState: () => ({
        projectName: 'P',
        cards: [{ id: 'c1', key: 'notes__a' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
      getStagedSyncCards: () => [],
      buildPayload: (s, staged) => ({ ...s, stagedSyncCards: staged ?? [] }),
      commitProjectDocument,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: reconcile,
      flushAll: vi.fn(),
    });

    await requestActionSync('folderScan', { projectId: 'p1' });

    expect(commitProjectDocument).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ reason: 'folderScan' }),
    );
    const result = await commitProjectDocument.mock.results[0].value;
    expect(result.deferred).not.toBe(true);
    expect(flushOutgoingProjectDocument).toHaveBeenCalled();
  });

  it('structuralChange does not push when target id is not the active project', async () => {
    registerActionSyncHandlers({
      getProjectId: () => 'old-project',
      getState: () => ({
        projectName: 'Old',
        cards: [{ id: 'card-1' }],
        canvasView: { x: 0, y: 0, zoom: 1 },
      }),
      getStagedSyncCards: () => [],
      buildPayload: (s) => s,
      touchIndex: vi.fn(),
      onLocalCacheFailed: vi.fn(),
      reconcileInbound: vi.fn(),
      flushAll: vi.fn(),
    });

    await requestActionSync('structuralChange', { projectId: 'new-project' });

    expect(flushOutgoingProjectDocument).not.toHaveBeenCalled();
  });
});
