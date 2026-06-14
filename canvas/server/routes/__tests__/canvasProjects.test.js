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
