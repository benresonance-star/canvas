import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../sync/projectSyncState.js', () => ({
  isServerSyncEnabled: () => true,
}));

vi.mock('../workspaceIndexRevision.js', () => ({
  getClientWorkspaceIndexRevision: vi.fn(() => 1),
  applyServerWorkspaceIndexRevision: vi.fn(),
}));

vi.mock('../sync/projectSyncClientId.js', () => ({
  getProjectSyncClientId: () => 'local-tab',
}));

describe('workspaceIndexSyncStream', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes stream URL helper', async () => {
    const { workspaceIndexStreamUrl } = await import('../canvasProjectsApi.js');
    expect(workspaceIndexStreamUrl()).toContain('/canvas/index/stream');
  });

  it('starts workspace index stream without reference errors', async () => {
    const created = [];
    class FakeEventSource {
      constructor(url) {
        this.url = url;
        created.push(this);
      }

      addEventListener() {}
      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource);

    const { startWorkspaceIndexSyncStream, stopWorkspaceIndexSyncStream } =
      await import('../sync/workspaceIndexSyncStream.js');
    startWorkspaceIndexSyncStream(() => {});

    expect(created).toHaveLength(1);
    expect(created[0].url).toContain('/canvas/index/stream');
    stopWorkspaceIndexSyncStream();
  });

  it('applies remote index updates and invokes refresh callback only for newer remote revisions', async () => {
    const listeners = {};
    class FakeEventSource {
      constructor() {
        this.closed = false;
      }

      addEventListener(type, handler) {
        listeners[type] = handler;
      }

      close() {
        this.closed = true;
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const revisionModule = await import('../workspaceIndexRevision.js');
    revisionModule.getClientWorkspaceIndexRevision.mockReturnValue(1);
    const onIndexUpdated = vi.fn();

    const { startWorkspaceIndexSyncStream, stopWorkspaceIndexSyncStream } =
      await import('../sync/workspaceIndexSyncStream.js');
    startWorkspaceIndexSyncStream(onIndexUpdated);

    listeners.index_updated({
      data: JSON.stringify({ revision: 2, updatedAt: 'remote', clientId: 'remote-tab' }),
    });

    expect(revisionModule.applyServerWorkspaceIndexRevision).toHaveBeenCalledWith(2);
    expect(onIndexUpdated).toHaveBeenCalledWith({
      revision: 2,
      updatedAt: 'remote',
      clientId: 'remote-tab',
    });

    revisionModule.getClientWorkspaceIndexRevision.mockReturnValue(2);
    listeners.index_updated({
      data: JSON.stringify({ revision: 2, updatedAt: 'stale', clientId: 'remote-tab' }),
    });

    expect(onIndexUpdated).toHaveBeenCalledTimes(1);
    stopWorkspaceIndexSyncStream();
  });

  it('updates revision but skips refresh callback for same-client echoes', async () => {
    const listeners = {};
    class FakeEventSource {
      addEventListener(type, handler) {
        listeners[type] = handler;
      }

      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const revisionModule = await import('../workspaceIndexRevision.js');
    revisionModule.getClientWorkspaceIndexRevision.mockReturnValue(1);
    const onIndexUpdated = vi.fn();

    const { startWorkspaceIndexSyncStream, stopWorkspaceIndexSyncStream } =
      await import('../sync/workspaceIndexSyncStream.js');
    startWorkspaceIndexSyncStream(onIndexUpdated);

    listeners.index_updated({
      data: JSON.stringify({ revision: 3, updatedAt: 'echo', clientId: 'local-tab' }),
    });

    expect(revisionModule.applyServerWorkspaceIndexRevision).toHaveBeenCalledWith(3);
    expect(onIndexUpdated).not.toHaveBeenCalled();
    stopWorkspaceIndexSyncStream();
  });
});
