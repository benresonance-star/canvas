import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/bim-style-presets.js', () => ({
  saveBimStylePreset: vi.fn(),
  listBimStylePresets: vi.fn(),
  getBimStylePreset: vi.fn(),
  updateBimStylePreset: vi.fn(),
  deleteBimStylePreset: vi.fn(),
}));

const repo = await import('../../repositories/bim-style-presets.js');
const { registerBimRoutes } = await import('../bim.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerBimRoutes(app, {
    requireDb: () => true,
    sendClusterError: (res, error) => res.status(500).json({ error: error.message }),
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

describe('bim style preset routes', () => {
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

  it('POST /bim/projects/:projectId/style-presets creates a preset', async () => {
    repo.saveBimStylePreset.mockResolvedValue({
      id: 'preset-1',
      projectId: 'project-1',
      name: 'Clay close-up',
      style: { renderStyle: 'clay' },
    });

    const { res, body } = await jsonRequest(server, '/bim/projects/project-1/style-presets', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Clay close-up',
        style: { renderStyle: 'clay' },
      }),
    });

    expect(res.status).toBe(201);
    expect(body.preset.name).toBe('Clay close-up');
    expect(repo.saveBimStylePreset).toHaveBeenCalledWith('project-1', expect.objectContaining({
      name: 'Clay close-up',
    }));
  });

  it('GET /bim/projects/:projectId/style-presets lists presets', async () => {
    repo.listBimStylePresets.mockResolvedValue([{ id: 'preset-1', name: 'Clay close-up' }]);

    const { res, body } = await jsonRequest(server, '/bim/projects/project-1/style-presets?cardId=card-1');

    expect(res.status).toBe(200);
    expect(body.presets).toHaveLength(1);
    expect(repo.listBimStylePresets).toHaveBeenCalledWith('project-1', { cardId: 'card-1' });
  });

  it('PATCH /bim/style-presets/:presetId updates a preset', async () => {
    repo.updateBimStylePreset.mockResolvedValue({ id: 'preset-1', name: 'Updated' });

    const { res, body } = await jsonRequest(server, '/bim/style-presets/preset-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    });

    expect(res.status).toBe(200);
    expect(body.preset.name).toBe('Updated');
  });

  it('DELETE /bim/style-presets/:presetId soft-deletes a preset', async () => {
    repo.deleteBimStylePreset.mockResolvedValue({ id: 'preset-1', name: 'Clay close-up' });

    const { res, body } = await jsonRequest(server, '/bim/style-presets/preset-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(body.preset.id).toBe('preset-1');
  });
});
