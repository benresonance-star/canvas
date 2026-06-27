import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/live-artifacts.js', () => ({
  addLiveSource: vi.fn(), createLiveArtifact: vi.fn(), deleteLiveSource: vi.fn(),
  getLiveArtifact: vi.fn(), listLiveArtifacts: vi.fn(), listLiveHistory: vi.fn(), listLiveRuns: vi.fn(),
  listLiveSources: vi.fn(), listProjectUpdates: vi.fn(), markAllProjectUpdatesRead: vi.fn(),
  markLiveExported: vi.fn(), markProjectUpdateRead: vi.fn(), updateLiveArtifact: vi.fn(),
  updateLiveSource: vi.fn(),
}));
vi.mock('../../services/liveArtifactRunner.js', () => ({ runLiveArtifact: vi.fn() }));
const repo = await import('../../repositories/live-artifacts.js');
const runner = await import('../../services/liveArtifactRunner.js');
const { registerLiveArtifactRoutes } = await import('../liveArtifacts.js');

function app() { const value = express(); value.use(express.json()); registerLiveArtifactRoutes(value, { requireDb: () => true }); return value; }
function listen(value) { return new Promise((resolve) => { const server = value.listen(0, () => resolve(server)); }); }
async function request(server, path, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }); return { response, body: response.status === 204 ? null : await response.json() }; }

describe('live artifact routes', () => {
  let server;
  beforeEach(async () => { vi.clearAllMocks(); server = await listen(app()); });
  afterEach(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('creates a project-scoped live agent feed', async () => {
    repo.createLiveArtifact.mockResolvedValue({ id: 'live-1', kind: 'agent_feed' });
    const result = await request(server, '/projects/p1/live-artifacts', { method: 'POST', body: JSON.stringify({ name: 'Development Feed' }) });
    expect(result.response.status).toBe(201);
    expect(result.body.live.kind).toBe('agent_feed');
  });

  it('returns run diagnostics', async () => {
    repo.listLiveRuns.mockResolvedValue([{ id: 'run-1', sourceCharCount: 1200, status: 'succeeded' }]);
    const result = await request(server, '/live-artifacts/live-1/runs');
    expect(result.response.status).toBe(200);
    expect(result.body.runs[0].sourceCharCount).toBe(1200);
  });

  it('returns the successful run result', async () => {
    runner.runLiveArtifact.mockResolvedValue({ status: 'succeeded', live: { id: 'live-1', projectId: 'p1' }, versionId: 'v1', versionNumber: 1 });
    const result = await request(server, '/live-artifacts/live-1/run', { method: 'POST', body: '{}' });
    expect(result.body.versionId).toBe('v1');
  });
});
