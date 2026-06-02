import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('projectSyncStream', () => {
  beforeEach(() => {
    vi.resetModules();
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
});
