import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/agent-templates.js', () => ({
  listAgentTemplates: vi.fn(),
  getAgentTemplate: vi.fn(),
  putAgentTemplate: vi.fn(),
  deleteAgentTemplate: vi.fn(),
}));

const repo = await import('../../repositories/agent-templates.js');
const { registerAgentTemplateRoutes } = await import('../agentTemplates.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerAgentTemplateRoutes(app);
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

describe('agent template routes', () => {
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

  it('lists templates', async () => {
    repo.listAgentTemplates.mockResolvedValue([{ id: 'brainstorming', label: 'Brainstorming Agent' }]);

    const { res, body } = await jsonRequest(server, '/agent/templates');

    expect(res.status).toBe(200);
    expect(body.templates).toHaveLength(1);
  });

  it('requires expectedRevision on update', async () => {
    const { res, body } = await jsonRequest(server, '/agent/templates/brainstorming', {
      method: 'PUT',
      body: JSON.stringify({ template: { label: 'Brainstorming Agent' } }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toBe('expectedRevision required');
    expect(repo.putAgentTemplate).not.toHaveBeenCalled();
  });

  it('returns conflict payload from repository', async () => {
    repo.putAgentTemplate.mockResolvedValue({
      ok: false,
      revision: 3,
      template: { id: 'brainstorming', label: 'Server copy' },
      updatedAt: 'server-time',
    });

    const { res, body } = await jsonRequest(server, '/agent/templates/brainstorming', {
      method: 'PUT',
      body: JSON.stringify({
        expectedRevision: 2,
        template: { id: 'brainstorming', label: 'Local copy' },
      }),
    });

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      error: 'conflict',
      revision: 3,
      template: { id: 'brainstorming' },
    });
  });

  it('returns conflict for create when the template id already exists', async () => {
    repo.putAgentTemplate.mockResolvedValue({
      ok: false,
      revision: 2,
      template: { id: 'brainstorming', label: 'Existing Agent' },
      updatedAt: 'server-time',
    });

    const { res, body } = await jsonRequest(server, '/agent/templates', {
      method: 'POST',
      body: JSON.stringify({
        template: { id: 'brainstorming', label: 'Brainstorming Agent' },
      }),
    });

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      error: 'conflict',
      revision: 2,
      template: { id: 'brainstorming' },
    });
  });
});
