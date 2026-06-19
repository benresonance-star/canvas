import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/flows.js', () => ({
  createFlow: vi.fn(),
  getFlow: vi.fn(),
  replaceFlow: vi.fn(),
  deleteFlow: vi.fn(),
}));

const repo = await import('../../repositories/flows.js');
const { registerFlowRoutes } = await import('../flows.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerFlowRoutes(app, {
    requireDb: () => true,
    sendClusterError: (res, error) => res.status(400).json({ error: error.message }),
  });
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, path, options) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

describe('flow routes', () => {
  let server;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await listen(createApp());
  });
  afterEach(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('creates a project flow', async () => {
    repo.createFlow.mockResolvedValue({ id: 'flow-1', title: 'Flow', revision: 1 });
    const { response, body } = await request(server, '/projects/project-1/flows', {
      method: 'POST',
      body: JSON.stringify({ title: 'Flow' }),
    });
    expect(response.status).toBe(201);
    expect(body.flow.id).toBe('flow-1');
    expect(repo.createFlow).toHaveBeenCalledWith('project-1', { title: 'Flow' });
  });

  it('returns revision conflicts without applying a fallback write', async () => {
    const error = new Error('revision conflict');
    error.code = 'FLOW_CONFLICT';
    error.currentRevision = 3;
    repo.replaceFlow.mockRejectedValue(error);
    const { response, body } = await request(server, '/flows/flow-1', {
      method: 'PUT',
      body: JSON.stringify({ expectedRevision: 2, nodes: [], edges: [] }),
    });
    expect(response.status).toBe(409);
    expect(body.currentRevision).toBe(3);
    expect(repo.replaceFlow).toHaveBeenCalledTimes(1);
  });
});
