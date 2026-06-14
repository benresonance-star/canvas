import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  cleanups: [],
  loadedEffects: [],
  serverSyncEnabled: true,
  patchSyncEnabled: true,
  bootCompleted: true,
  canvasInteractionActive: false,
  remotePatchAppliedListener: null,
  canvasIdleListener: null,
  startProjectSyncStream: vi.fn(),
  stopProjectSyncStream: vi.fn(),
  startWorkspaceIndexSyncStream: vi.fn(),
  stopWorkspaceIndexSyncStream: vi.fn(),
  setRemotePatchAppliedListener: vi.fn((listener) => {
    mock.remotePatchAppliedListener = listener;
  }),
  setCanvasInteractionIdleListener: vi.fn((listener) => {
    mock.canvasIdleListener = listener;
  }),
  flushPendingRemoteProjectPatch: vi.fn(),
  runExclusive: vi.fn(async (_label, fn) => fn()),
}));

vi.mock('react', () => ({
  useEffect: vi.fn((effect) => {
    const cleanup = effect();
    mock.loadedEffects.push(effect);
    if (typeof cleanup === 'function') mock.cleanups.push(cleanup);
  }),
}));

vi.mock('../../../lib/persistence.js', () => ({
  normalizeLoadedProject: vi.fn((payload) => ({ normalized: true, payload })),
}));

vi.mock('../../../lib/projects.js', () => ({
  isServerSyncEnabled: () => mock.serverSyncEnabled,
  isProjectPatchSyncEnabled: () => mock.patchSyncEnabled,
  startProjectSyncStream: (...args) => mock.startProjectSyncStream(...args),
  stopProjectSyncStream: (...args) => mock.stopProjectSyncStream(...args),
  startWorkspaceIndexSyncStream: (...args) => mock.startWorkspaceIndexSyncStream(...args),
  stopWorkspaceIndexSyncStream: (...args) => mock.stopWorkspaceIndexSyncStream(...args),
  setRemotePatchAppliedListener: (...args) => mock.setRemotePatchAppliedListener(...args),
  setCanvasInteractionIdleListener: (...args) => mock.setCanvasInteractionIdleListener(...args),
  flushPendingRemoteProjectPatch: (...args) => mock.flushPendingRemoteProjectPatch(...args),
  getProjectSyncClientId: () => 'local-tab',
}));

vi.mock('../../../lib/projectSyncCoordinator.js', () => ({
  isBootSyncCompleted: () => mock.bootCompleted,
  runExclusive: (...args) => mock.runExclusive(...args),
}));

vi.mock('../../../lib/canvasInteraction.js', () => ({
  isCanvasInteractionActive: () => mock.canvasInteractionActive,
}));

function refs(overrides = {}) {
  return {
    activeProjectIdRef: { current: 'p1' },
    committedProjectIdRef: { current: 'p1' },
    loadProjectIntoStateRef: { current: vi.fn(async () => true) },
    refreshProjectListFromServerRef: { current: vi.fn(async () => true) },
    switchingProjectRef: { current: false },
    ...overrides,
  };
}

async function renderUseSyncStreams(props = {}) {
  const { useSyncStreams } = await import('../useSyncStreams.js');
  const baseRefs = refs(props.refs ?? {});
  useSyncStreams({
    loaded: true,
    activeProjectId: 'p1',
    ...baseRefs,
    ...(props.params ?? {}),
  });
  return baseRefs;
}

describe('useSyncStreams behavior', () => {
  beforeEach(() => {
    mock.cleanups = [];
    mock.loadedEffects = [];
    mock.serverSyncEnabled = true;
    mock.patchSyncEnabled = true;
    mock.bootCompleted = true;
    mock.canvasInteractionActive = false;
    mock.remotePatchAppliedListener = null;
    mock.canvasIdleListener = null;
    mock.startProjectSyncStream.mockClear();
    mock.stopProjectSyncStream.mockClear();
    mock.startWorkspaceIndexSyncStream.mockClear();
    mock.stopWorkspaceIndexSyncStream.mockClear();
    mock.setRemotePatchAppliedListener.mockClear();
    mock.setCanvasInteractionIdleListener.mockClear();
    mock.flushPendingRemoteProjectPatch.mockReset();
    mock.runExclusive.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    for (const cleanup of mock.cleanups.splice(0)) cleanup();
  });

  it('starts project and workspace streams once booted and loaded', async () => {
    await renderUseSyncStreams();

    expect(mock.startProjectSyncStream).toHaveBeenCalledWith('p1');
    expect(mock.startWorkspaceIndexSyncStream).toHaveBeenCalledTimes(1);

    mock.cleanups.forEach((cleanup) => cleanup());
    expect(mock.stopProjectSyncStream).toHaveBeenCalled();
    expect(mock.stopWorkspaceIndexSyncStream).toHaveBeenCalled();
  });

  it('stops streams when server sync or patch sync is disabled', async () => {
    mock.serverSyncEnabled = false;
    await renderUseSyncStreams();

    expect(mock.startProjectSyncStream).not.toHaveBeenCalled();
    expect(mock.startWorkspaceIndexSyncStream).not.toHaveBeenCalled();
    expect(mock.stopProjectSyncStream).toHaveBeenCalled();
    expect(mock.stopWorkspaceIndexSyncStream).toHaveBeenCalled();
  });

  it('loads the current committed project when a remote patch is applied', async () => {
    const hookRefs = await renderUseSyncStreams();

    mock.remotePatchAppliedListener('p1', { cards: [{ id: 'c1' }] });

    expect(hookRefs.loadProjectIntoStateRef.current).toHaveBeenCalledWith('p1', {
      localOnly: true,
      document: { normalized: true, payload: { cards: [{ id: 'c1' }] } },
      hydratePreviews: false,
    });
  });

  it('ignores remote patch callbacks for non-current projects or active interactions', async () => {
    const hookRefs = await renderUseSyncStreams();

    mock.remotePatchAppliedListener('other', { cards: [{ id: 'other' }] });
    mock.canvasInteractionActive = true;
    mock.remotePatchAppliedListener('p1', { cards: [{ id: 'blocked' }] });

    expect(hookRefs.loadProjectIntoStateRef.current).not.toHaveBeenCalled();
  });

  it('flushes pending remote patch on idle and hydrates only if selection is still current', async () => {
    const hookRefs = await renderUseSyncStreams();
    mock.flushPendingRemoteProjectPatch.mockResolvedValue({
      applied: true,
      payload: { cards: [{ id: 'idle' }] },
    });

    mock.canvasIdleListener();
    await Promise.resolve();

    expect(mock.flushPendingRemoteProjectPatch).toHaveBeenCalledWith('p1', 'local-tab');
    expect(hookRefs.loadProjectIntoStateRef.current).toHaveBeenCalledWith('p1', {
      localOnly: true,
      document: { normalized: true, payload: { cards: [{ id: 'idle' }] } },
      hydratePreviews: false,
    });
  });

  it('refreshes project list through runExclusive on workspace index stream update', async () => {
    const hookRefs = await renderUseSyncStreams();
    const onIndexUpdated = mock.startWorkspaceIndexSyncStream.mock.calls[0][0];

    onIndexUpdated({ revision: 3 });
    await Promise.resolve();

    expect(mock.runExclusive).toHaveBeenCalledWith(
      'index-sse',
      expect.any(Function),
      { mode: 'skip' },
    );
    expect(hookRefs.refreshProjectListFromServerRef.current).toHaveBeenCalledWith({
      reconcileScope: 'none',
    });
  });
});
