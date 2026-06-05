import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    vi.unstubAllGlobals();
  });
});
