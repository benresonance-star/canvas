import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/canvas-projects.js', () => ({
  getCanvasIndex: vi.fn(),
  putCanvasIndex: vi.fn(),
  getCanvasProject: vi.fn(),
  getCanvasProjectMeta: vi.fn(),
  getCanvasProjectLayout: vi.fn(),
  putCanvasProject: vi.fn(),
  patchCanvasProject: vi.fn(),
  deleteCanvasProject: vi.fn(),
}));

vi.mock('../../repositories/canvas-previews.js', () => ({
  deletePreviewBlobsForProject: vi.fn(),
}));

vi.mock('../../repositories/artifact-view-diagnostics.js', () => ({
  recordArtifactViewDiagnostics: vi.fn(),
  summarizeArtifactViewDiagnostics: vi.fn(),
}));

vi.mock('../../repositories/artifact-views.js', () => ({
  listArtifactViewsByProject: vi.fn(),
}));

vi.mock('../../services/artifactViewPlacementService.js', () => ({
  commitArtifactViewPlacements: vi.fn(),
  commitArtifactViewTransfer: vi.fn(),
}));

vi.mock('../../lib/projectSyncHub.js', () => ({
  subscribeProjectSync: vi.fn(),
  unsubscribeProjectSync: vi.fn(),
  publishProjectSync: vi.fn(),
}));

vi.mock('../../lib/workspaceIndexSyncHub.js', () => ({
  subscribeWorkspaceIndexSync: vi.fn(),
  unsubscribeWorkspaceIndexSync: vi.fn(),
  publishWorkspaceIndexSync: vi.fn(),
}));

const repo = await import('../../repositories/canvas-projects.js');
const projectHub = await import('../../lib/projectSyncHub.js');
const indexHub = await import('../../lib/workspaceIndexSyncHub.js');
const diagnostics = await import('../../repositories/artifact-view-diagnostics.js');
const artifactViews = await import('../../repositories/artifact-views.js');
const placementService = await import('../../services/artifactViewPlacementService.js');
const { registerCanvasProjectRoutes } = await import('../canvasProjects.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerCanvasProjectRoutes(app, { requireDb: () => true });
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function jsonRequest(server, path, init = {}) {
  const res = await fetch(`${baseUrl(server)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json();
  return { res, body };
}

describe('canvas project routes', () => {
  /** @type {import('node:http').Server | null} */
  let server = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await listen(createApp());
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  });

  it('PUT /canvas/index validates expectedRevision before persistence', async () => {
    const { res, body } = await jsonRequest(server, '/canvas/index', {
      method: 'PUT',
      body: JSON.stringify({ index: { version: 1, projects: [] } }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toBe('expectedRevision required');
    expect(repo.putCanvasIndex).not.toHaveBeenCalled();
    expect(indexHub.publishWorkspaceIndexSync).not.toHaveBeenCalled();
  });

  it('PATCH placement commits through canonical authority and publishes the revision', async () => {
    placementService.commitArtifactViewPlacements.mockResolvedValue({
      documentRevision: 12,
      updatedAt: '2026-07-13T00:00:00.000Z',
      views: [{ artifactId: 'artifact-1', version: 8 }],
    });
    const placements = [{
      artifactId: 'artifact-1', expectedVersion: 7,
      x: 10, y: 20, width: 300, height: 180,
    }];

    const { res, body } = await jsonRequest(server, '/canvas/projects/project-1/artifact-view-placements', {
      method: 'PATCH', body: JSON.stringify({ placements }),
    });

    expect(res.status).toBe(200);
    expect(body.views[0].version).toBe(8);
    expect(placementService.commitArtifactViewPlacements).toHaveBeenCalledWith('project-1', {
      placements, actorId: undefined,
    });
    expect(projectHub.publishProjectSync).toHaveBeenCalledWith('project-1', 'project_updated', expect.objectContaining({
      revision: 12, reason: 'artifact-view-placement',
    }));
  });

  it('POST surface transfer commits through canonical authority', async () => {
    placementService.commitArtifactViewTransfer.mockResolvedValue({
      documentRevision: 13,
      updatedAt: '2026-07-13T00:00:00.000Z',
      view: { artifactId: 'artifact-1', surface: 'dock', version: 1 },
    });
    const transfer = {
      artifactId: 'artifact-1', expectedVersion: 8,
      fromSurface: 'canvas', toSurface: 'dock',
    };
    const payload = {
      cards: [],
      stagedSyncCards: [{
        type: 'user_note', versions: [{ artifactRef: { id: 'artifact-1' } }],
      }],
    };

    const { res, body } = await jsonRequest(server, '/canvas/projects/project-1/artifact-view-transfers', {
      method: 'POST', body: JSON.stringify({ transfer, payload }),
    });

    expect(res.status).toBe(200);
    expect(body.view.surface).toBe('dock');
    expect(placementService.commitArtifactViewTransfer).toHaveBeenCalledWith('project-1', {
      transfer, payload, actorId: undefined,
    });
    expect(projectHub.publishProjectSync).toHaveBeenCalledWith('project-1', 'project_updated', expect.objectContaining({
      revision: 13, reason: 'artifact-view-transfer',
    }));
  });

  it('PUT /canvas/projects/:id rejects non-object payloads before persistence', async () => {
    const { res, body } = await jsonRequest(server, '/canvas/projects/p1', {
      method: 'PUT',
      body: JSON.stringify({ payload: [], expectedRevision: 1 }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toBe('payload required');
    expect(repo.putCanvasProject).not.toHaveBeenCalled();
  });

  it('PATCH /canvas/projects/:id validates revision and trace shape before persistence', async () => {
    const { res, body } = await jsonRequest(server, '/canvas/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: 'nope',
        traceId: 123,
        ops: [{ op: 'replaceDocument', payload: {} }],
      }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toBe('expectedRevision must be a non-negative integer');
    expect(repo.patchCanvasProject).not.toHaveBeenCalled();
    expect(projectHub.publishProjectSync).not.toHaveBeenCalled();
  });

  it('POST artifact-view diagnostics validates and records rollout counts', async () => {
    diagnostics.recordArtifactViewDiagnostics.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { res, body } = await jsonRequest(
      server,
      '/canvas/projects/p1/artifact-view-diagnostics',
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'shadow',
          eventType: 'comparison',
          counts: { loads: 1, geometry_mismatch: 2 },
        }),
      },
    );

    expect(res.status).toBe(202);
    expect(body.recorded).toBe(2);
    expect(diagnostics.recordArtifactViewDiagnostics).toHaveBeenCalledWith({
      projectId: 'p1',
      mode: 'shadow',
      eventType: 'comparison',
      counts: { loads: 1, geometry_mismatch: 2 },
      metadata: {},
    });
  });

  it('GET artifact-view diagnostics bounds the summary window', async () => {
    diagnostics.summarizeArtifactViewDiagnostics.mockResolvedValue([
      { mode: 'shadow', eventType: 'comparison', category: 'loads', count: 3 },
    ]);
    const { res, body } = await jsonRequest(
      server,
      '/canvas/projects/p1/artifact-view-diagnostics?hours=999',
    );

    expect(res.status).toBe(200);
    expect(body.hours).toBe(168);
    expect(diagnostics.summarizeArtifactViewDiagnostics).toHaveBeenCalledWith(
      'p1',
      { hours: 168 },
    );
  });

  it('GET artifact-view audit compares server-authoritative document geometry', async () => {
    const note = {
      id: 'c1', type: 'user_note', x: 1, y: 2, width: 3, height: 4,
      versions: [{ artifactRef: { id: 'a1' } }],
    };
    repo.getCanvasProject.mockResolvedValue({ payload: { cards: [note] } });
    artifactViews.listArtifactViewsByProject.mockResolvedValue([{
      id: expect.anything,
      artifactId: 'a1', surface: 'canvas', viewType: 'card',
      x: 1, y: 2, width: 3, height: 4,
    }]);

    const { res, body } = await jsonRequest(server, '/canvas/projects/p1/artifact-view-audit');
    expect(res.status).toBe(200);
    expect(body.counts).toMatchObject({ loads: 1, eligible_cards: 1 });
  });

  it('PUT /canvas/index returns conflict payload and does not publish SSE', async () => {
    repo.putCanvasIndex.mockResolvedValue({
      ok: false,
      conflict: true,
      revision: 8,
      payload: { version: 1, activeProjectId: 'server', projects: [] },
      updatedAt: 'server-time',
    });

    const { res, body } = await jsonRequest(server, '/canvas/index', {
      method: 'PUT',
      body: JSON.stringify({
        expectedRevision: 7,
        clientId: 'client-a',
        index: { version: 1, activeProjectId: null, projects: [] },
      }),
    });

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      error: 'conflict',
      revision: 8,
      updatedAt: 'server-time',
    });
    expect(indexHub.publishWorkspaceIndexSync).not.toHaveBeenCalled();
  });

  it('PUT /canvas/index publishes index_updated after a successful CAS write', async () => {
    repo.getCanvasProjectMeta.mockResolvedValue({ revision: 1, updatedAt: 'doc-time' });
    repo.putCanvasIndex.mockResolvedValue({
      ok: true,
      revision: 9,
      updatedAt: 'index-time',
    });

    const { res, body } = await jsonRequest(server, '/canvas/index', {
      method: 'PUT',
      body: JSON.stringify({
        expectedRevision: 8,
        clientId: 'client-a',
        deletedProjectIds: ['deleted-a'],
        index: {
          version: 1,
          activeProjectId: 'p1',
          projects: [{ id: 'p1', name: 'P1', updatedAt: 1, archived: false }],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(body).toEqual({ revision: 9, updatedAt: 'index-time' });
    expect(repo.putCanvasIndex).toHaveBeenCalledWith(
      expect.objectContaining({ activeProjectId: 'p1' }),
      8,
      { deletedProjectIds: ['deleted-a'], enforceDocumentIntegrity: true },
    );
    expect(indexHub.publishWorkspaceIndexSync).toHaveBeenCalledWith('index_updated', {
      revision: 9,
      updatedAt: 'index-time',
      clientId: 'client-a',
    });
  });

  it('PATCH /canvas/projects/:id publishes project_updated with patch metadata', async () => {
    const ops = [{
      op: 'replaceDocument',
      payload: { projectName: 'Client', cards: [{ id: 'c1' }] },
    }];
    repo.patchCanvasProject.mockResolvedValue({
      ok: true,
      revision: 4,
      updatedAt: 'project-time',
      payload: { cards: [{ id: 'c1' }] },
    });

    const { res, body } = await jsonRequest(server, '/canvas/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: 3,
        ops,
        clientId: 'client-a',
        reason: 'placementTransfer:dock',
        traceId: 'trace-a',
      }),
    });

    expect(res.status).toBe(200);
    expect(body).toEqual({ revision: 4, updatedAt: 'project-time' });
    expect(repo.patchCanvasProject).toHaveBeenCalledWith('p1', expect.objectContaining({
      expectedRevision: 3,
      ops,
      traceId: 'trace-a',
      allowDockOnlyRemoteOverwrite: true,
    }));
    expect(projectHub.publishProjectSync).toHaveBeenCalledWith('p1', 'project_updated', {
      revision: 4,
      updatedAt: 'project-time',
      ops,
      clientId: 'client-a',
      reason: 'placementTransfer:dock',
      traceId: 'trace-a',
    });
  });

  it('GET /canvas/projects/:id optional returns null payload instead of 404', async () => {
    repo.getCanvasProject.mockResolvedValue(null);

    const { res, body } = await jsonRequest(server, '/canvas/projects/missing?optional=1');

    expect(res.status).toBe(200);
    expect(body).toEqual({
      payload: null,
      updatedAt: null,
      revision: 0,
      missing: true,
    });
  });

  it('GET /canvas/projects/:id/stream subscribes and sends current revision event', async () => {
    repo.getCanvasProjectMeta.mockResolvedValue({
      revision: 5,
      updatedAt: 'project-time',
    });
    const controller = new AbortController();
    const res = await fetch(`${baseUrl(server)}/canvas/projects/p1/stream`, {
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const { value } = await reader.read();
    controller.abort();

    const chunk = new TextDecoder().decode(value);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(chunk).toContain('event: revision');
    expect(chunk).toContain('"revision":5');
    expect(projectHub.subscribeProjectSync).toHaveBeenCalledWith('p1', expect.anything());
  });
});
