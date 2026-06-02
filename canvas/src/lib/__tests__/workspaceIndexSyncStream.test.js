import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sync/projectSyncState.js', () => ({
  getServerSyncEnabled: () => true,
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
});
