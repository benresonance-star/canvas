import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/primitives-list.js', () => ({
  listClusterPrimitives: vi.fn(),
  listWorkspacePrimitives: vi.fn(),
  getPrimitiveDetail: vi.fn(),
}));

vi.mock('../../repositories/events-list.js', () => ({
  listClusterEvents: vi.fn(),
  listWorkspaceEvents: vi.fn(),
}));

vi.mock('../../repositories/graph.js', () => ({
  buildClusterGraph: vi.fn(),
}));

const primitiveRepo = await import('../../repositories/primitives-list.js');
const eventRepo = await import('../../repositories/events-list.js');
const { registerPrimitiveRoutes } = await import('../primitives.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerPrimitiveRoutes(app, {
    requireDb: () => true,
    sendClusterError: (res, e) => res.status(500).json({ error: e.message }),
  });
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

async function jsonRequest(server, path) {
  const res = await fetch(`${baseUrl(server)}${path}`);
  const body = await res.json();
  return { res, body };
}

describe('primitive routes', () => {
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

  it('GET /workspace/primitives lists aggregate workspace primitives', async () => {
    primitiveRepo.listWorkspacePrimitives.mockResolvedValue({
      items: [{ type: 'artifact', id: 'artifact-1' }],
    });

    const { res, body } = await jsonRequest(server, '/workspace/primitives?type=artifact&limit=25');

    expect(res.status).toBe(200);
    expect(body).toEqual({ items: [{ type: 'artifact', id: 'artifact-1' }] });
    expect(primitiveRepo.listWorkspacePrimitives).toHaveBeenCalledWith({
      type: 'artifact',
      limit: 25,
    });
  });

  it('GET /workspace/events lists aggregate workspace events', async () => {
    eventRepo.listWorkspaceEvents.mockResolvedValue({
      items: [{ id: 'event-1', target_id: 'artifact-1', target_type: 'artifact' }],
    });

    const { res, body } = await jsonRequest(server, '/workspace/events?limit=25');

    expect(res.status).toBe(200);
    expect(body).toEqual({
      items: [{ id: 'event-1', target_id: 'artifact-1', target_type: 'artifact' }],
    });
    expect(eventRepo.listWorkspaceEvents).toHaveBeenCalledWith({ limit: 25 });
  });
});
