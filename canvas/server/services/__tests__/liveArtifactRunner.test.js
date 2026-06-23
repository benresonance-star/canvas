import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/live-artifacts.js', () => ({
  getLiveArtifact: vi.fn(), startLiveRun: vi.fn(), buildLiveSourceContext: vi.fn(),
  finishLiveRunSkipped: vi.fn(), finishLiveRunFailed: vi.fn(), finishLiveRunSuccess: vi.fn(),
}));
vi.mock('../../lib/projectSyncHub.js', () => ({ publishProjectSync: vi.fn() }));
const repo = await import('../../repositories/live-artifacts.js');
const hub = await import('../../lib/projectSyncHub.js');
const { runLiveArtifact } = await import('../liveArtifactRunner.js');

const output = {
  title: 'Feed', reportDate: '2026-06-20', overview: 'Changed',
  meaningfulChangeDetected: true, changeScore: 0.7,
  changesSinceLastUpdate: [], currentPosition: '', risks: [], openQuestions: [],
  recommendedNextActions: [], staleOrMissingInformation: [], markdownBody: '# Feed',
};

describe('live artifact runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getLiveArtifact.mockResolvedValue({
      id: 'live-1', projectId: 'p1', onlyUpdateIfMeaningful: true,
      minimumChangeThreshold: 0.25,
    });
    repo.startLiveRun.mockResolvedValue('run-1');
    repo.buildLiveSourceContext.mockResolvedValue('source');
    repo.finishLiveRunSuccess.mockResolvedValue({ versionId: 'v1', versionNumber: 1 });
  });

  it('creates an immutable version on meaningful output', async () => {
    const result = await runLiveArtifact('live-1', { generate: vi.fn().mockResolvedValue(output) });
    expect(result.status).toBe('succeeded');
    expect(repo.finishLiveRunSuccess).toHaveBeenCalledOnce();
    expect(hub.publishProjectSync).toHaveBeenCalledWith('p1', 'live_updated', expect.any(Object));
  });

  it('records a skip without creating a version', async () => {
    const result = await runLiveArtifact('live-1', {
      generate: vi.fn().mockResolvedValue({ ...output, changeScore: 0.1 }),
    });
    expect(result.status).toBe('skipped_no_meaningful_change');
    expect(repo.finishLiveRunSkipped).toHaveBeenCalledOnce();
    expect(repo.finishLiveRunSuccess).not.toHaveBeenCalled();
  });
});
