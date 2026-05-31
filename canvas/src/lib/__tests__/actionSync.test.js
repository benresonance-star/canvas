import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../projectSync.js', () => ({
  cancelPendingProjectSave: vi.fn(),
  persistProjectDocumentLocally: vi.fn(async () => true),
  flushOutgoingProjectDocument: vi.fn(async () => ({ ok: true })),
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
