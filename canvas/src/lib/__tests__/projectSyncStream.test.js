import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../sync/projectSyncState.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    isServerSyncEnabled: () => true,
    getServerSyncEnabled: () => true,
  };
});

vi.mock('../sync/projectPatchSync.js', () => ({
  isProjectPatchSyncEnabled: () => true,
}));

vi.mock('../sync/projectSyncClientId.js', () => ({
  getProjectSyncClientId: () => 'local-tab',
}));

vi.mock('../sync/projectSyncRemoteApply.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    applyRemoteProjectPatch: vi.fn(original.applyRemoteProjectPatch),
  };
});

vi.mock('../sync/projectSyncRevision.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ensureClientRevision: vi.fn(async () => true),
    getClientRevision: vi.fn(() => 1),
    applyServerProjectRevision: vi.fn(),
  };
});

describe('projectSyncStream', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_CANVAS_PATCH_SYNC', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('applyRemoteProjectPatch ignores echo clientId', async () => {
    const { applyRemoteProjectPatch, resetProjectSyncRemoteApplyForTests } =
      await import('../sync/projectSyncRemoteApply.js');
    resetProjectSyncRemoteApplyForTests();
    const result = await applyRemoteProjectPatch(
      'p1',
      [{ op: 'setProjectName', projectName: 'X' }],
      2,
      { clientId: 'same', localClientId: 'same' },
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('echo');
  });

  it('consumes project_updated SSE events into remote patch apply', async () => {
    const listeners = {};
    class FakeEventSource {
      constructor(url) {
        this.url = url;
      }

      addEventListener(type, handler) {
        listeners[type] = handler;
      }

      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const remoteApply = await import('../sync/projectSyncRemoteApply.js');
    const revisionModule = await import('../sync/projectSyncRevision.js');
    const { startProjectSyncStream, stopProjectSyncStream } =
      await import('../sync/projectSyncStream.js');

    startProjectSyncStream('p-sse');
    listeners.project_updated({
      data: JSON.stringify({
        revision: 7,
        clientId: 'remote-tab',
        traceId: 'trace-1',
        ops: [{ op: 'setProjectName', projectName: 'Remote' }],
      }),
    });

    expect(revisionModule.ensureClientRevision).toHaveBeenCalledWith('p-sse');
    expect(remoteApply.applyRemoteProjectPatch).toHaveBeenCalledWith(
      'p-sse',
      [{ op: 'setProjectName', projectName: 'Remote' }],
      7,
      {
        clientId: 'remote-tab',
        localClientId: 'local-tab',
        traceId: 'trace-1',
      },
    );
    stopProjectSyncStream();
  });

  it('consumes revision SSE events into client revision state when server is ahead', async () => {
    const listeners = {};
    class FakeEventSource {
      addEventListener(type, handler) {
        listeners[type] = handler;
      }

      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const revisionModule = await import('../sync/projectSyncRevision.js');
    revisionModule.getClientRevision.mockReturnValue(2);
    const { startProjectSyncStream, stopProjectSyncStream } =
      await import('../sync/projectSyncStream.js');

    startProjectSyncStream('p-rev');
    listeners.revision({
      data: JSON.stringify({ revision: 4, updatedAt: 'server-time' }),
    });
    await Promise.resolve();

    expect(revisionModule.ensureClientRevision).toHaveBeenCalledWith('p-rev');
    expect(revisionModule.applyServerProjectRevision).toHaveBeenCalledWith(
      'p-rev',
      'server-time',
      4,
    );
    stopProjectSyncStream();
  });
});
