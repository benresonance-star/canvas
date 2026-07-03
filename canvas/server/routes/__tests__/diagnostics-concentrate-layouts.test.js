import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/diagnostics-concentrate-layouts.js', () => ({
  listConcentrateLayouts: vi.fn(),
  getConcentrateLayout: vi.fn(),
  putConcentrateLayout: vi.fn(),
}));

const repo = await import('../../repositories/diagnostics-concentrate-layouts.js');
const { registerDiagnosticsConcentrateLayoutRoutes } = await import('../diagnosticsConcentrateLayouts.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerDiagnosticsConcentrateLayoutRoutes(app, {
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

describe('diagnostics concentrate layout routes', () => {
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

  it('GET /canvas/diagnostics/concentrate-layouts requires specVersion', async () => {
    const { res, body } = await jsonRequest(server, '/canvas/diagnostics/concentrate-layouts');
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/specVersion/i);
  });

  it('GET /canvas/diagnostics/concentrate-layouts lists layouts for specVersion', async () => {
    repo.listConcentrateLayouts.mockResolvedValue([
      {
        actionId: 'add_note',
        specVersion: '2026-07-03-nested-studios',
        nodeOverrides: {},
        edgeAnchors: {},
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
    ]);

    const { res, body } = await jsonRequest(
      server,
      '/canvas/diagnostics/concentrate-layouts?specVersion=2026-07-03-nested-studios',
    );

    expect(res.status).toBe(200);
    expect(body.layouts).toHaveLength(1);
    expect(repo.listConcentrateLayouts).toHaveBeenCalledWith('2026-07-03-nested-studios');
  });

  it('GET /canvas/diagnostics/concentrate-layouts/:actionId returns 404 when missing', async () => {
    repo.getConcentrateLayout.mockResolvedValue(null);

    const { res } = await jsonRequest(
      server,
      '/canvas/diagnostics/concentrate-layouts/add_note?specVersion=2026-07-03-nested-studios',
    );

    expect(res.status).toBe(404);
  });

  it('PUT /canvas/diagnostics/concentrate-layouts/:actionId upserts layout', async () => {
    repo.putConcentrateLayout.mockResolvedValue({
      actionId: 'add_note',
      specVersion: '2026-07-03-nested-studios',
      nodeOverrides: { addMenu: { centerX: 10, centerY: 20 } },
      edgeAnchors: {},
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    const { res, body } = await jsonRequest(
      server,
      '/canvas/diagnostics/concentrate-layouts/add_note',
      {
        method: 'PUT',
        body: JSON.stringify({
          specVersion: '2026-07-03-nested-studios',
          nodeOverrides: { addMenu: { centerX: 10, centerY: 20 } },
          edgeAnchors: {},
        }),
      },
    );

    expect(res.status).toBe(200);
    expect(body.actionId).toBe('add_note');
    expect(repo.putConcentrateLayout).toHaveBeenCalledWith(
      'add_note',
      '2026-07-03-nested-studios',
      expect.objectContaining({
        nodeOverrides: { addMenu: { centerX: 10, centerY: 20 } },
      }),
    );
  });

  it('PUT rejects missing specVersion', async () => {
    const { res, body } = await jsonRequest(
      server,
      '/canvas/diagnostics/concentrate-layouts/add_note',
      {
        method: 'PUT',
        body: JSON.stringify({ nodeOverrides: {} }),
      },
    );

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/specVersion/i);
  });
});
