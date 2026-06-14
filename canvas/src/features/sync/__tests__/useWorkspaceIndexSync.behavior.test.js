import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  effects: [],
  loadProjectIndex: vi.fn(),
  refreshReconciledProjectList: vi.fn(),
  serverSyncEnabled: true,
  bootCompleted: true,
  runExclusive: vi.fn(async (_label, fn) => fn()),
}));

vi.mock('react', () => ({
  useCallback: (fn) => fn,
  useEffect: vi.fn((effect) => {
    mock.effects.push(effect);
    return effect();
  }),
  useRef: (value) => ({ current: value }),
}));

vi.mock('../../../lib/projects.js', () => ({
  loadProjectIndex: (...args) => mock.loadProjectIndex(...args),
  refreshReconciledProjectList: (...args) => mock.refreshReconciledProjectList(...args),
  isServerSyncEnabled: () => mock.serverSyncEnabled,
}));

vi.mock('../../../lib/projectSyncCoordinator.js', () => ({
  PROJECT_SYNC_INDEX_POLL_INTERVAL_MS: 1000,
  isBootSyncCompleted: () => mock.bootCompleted,
  runExclusive: (...args) => mock.runExclusive(...args),
}));

function createParams(overrides = {}) {
  return {
    activeProjectIdRef: { current: 'p1' },
    committedProjectIdRef: { current: 'p1' },
    switchingProjectRef: { current: false },
    projectSwitchLoading: false,
    projectNameDirtyRef: { current: false },
    stateRef: { current: { projectName: 'Old Name', cards: [] } },
    attemptRestoreRef: { current: vi.fn(async () => true) },
    lastLoadedCardsRef: { current: [{ id: 'c1' }] },
    setProjectList: vi.fn(),
    setSyncStatus: vi.fn(),
    setState: vi.fn(),
    loaded: true,
    ...overrides,
  };
}

async function renderUseWorkspaceIndexSync(params = createParams()) {
  const { useWorkspaceIndexSync } = await import('../useWorkspaceIndexSync.js');
  return useWorkspaceIndexSync(params);
}

describe('useWorkspaceIndexSync behavior', () => {
  beforeEach(() => {
    mock.effects = [];
    mock.serverSyncEnabled = true;
    mock.bootCompleted = true;
    mock.loadProjectIndex.mockReset();
    mock.refreshReconciledProjectList.mockReset();
    mock.runExclusive.mockClear();
    vi.resetModules();
    vi.stubGlobal('document', { visibilityState: 'hidden' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('projects active index name into state when the header is not dirty', async () => {
    const params = createParams();
    let state = params.stateRef.current;
    params.setState.mockImplementation((updater) => {
      state = updater(state);
    });

    const { syncActiveProjectNameFromIndex } = await renderUseWorkspaceIndexSync(params);
    syncActiveProjectNameFromIndex({
      version: 1,
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Server Name', updatedAt: 1, archived: false }],
    });

    expect(params.stateRef.current.projectName).toBe('Server Name');
    expect(state.projectName).toBe('Server Name');
  });

  it('does not overwrite a dirty project name from index refresh', async () => {
    const params = createParams({
      projectNameDirtyRef: { current: true },
    });
    const { syncActiveProjectNameFromIndex } = await renderUseWorkspaceIndexSync(params);

    syncActiveProjectNameFromIndex({
      version: 1,
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Server Name', updatedAt: 1, archived: false }],
    });

    expect(params.stateRef.current.projectName).toBe('Old Name');
    expect(params.setState).not.toHaveBeenCalled();
  });

  it('refreshes menu rows and skips dirty active project during reconcile', async () => {
    const params = createParams({
      projectNameDirtyRef: { current: true },
    });
    mock.refreshReconciledProjectList.mockResolvedValue([
      { id: 'p1', name: 'Local Dirty', updatedAt: 1, archived: false },
    ]);
    mock.loadProjectIndex.mockResolvedValue({
      version: 1,
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Server Name', updatedAt: 1, archived: false }],
    });

    const { refreshProjectListFromServer } = await renderUseWorkspaceIndexSync(params);
    await refreshProjectListFromServer({ reconcileScope: 'active' });

    expect(mock.refreshReconciledProjectList).toHaveBeenCalledWith(expect.objectContaining({
      activeProjectId: 'p1',
      reconcileScope: 'active',
      skipProjectIds: expect.any(Set),
    }));
    const options = mock.refreshReconciledProjectList.mock.calls[0][0];
    expect(options.skipProjectIds.has('p1')).toBe(true);
    expect(params.setProjectList).toHaveBeenCalledWith([
      { id: 'p1', name: 'Local Dirty', updatedAt: 1, archived: false },
    ]);
    expect(params.attemptRestoreRef.current).toHaveBeenCalledWith('p1', [{ id: 'c1' }]);
  });
});
