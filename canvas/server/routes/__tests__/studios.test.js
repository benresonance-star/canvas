import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/studios.js', () => ({
  applyStudioPromotion: vi.fn(),
  archiveStudio: vi.fn(),
  restoreStudio: vi.fn(),
  createStudioCandidate: vi.fn(),
  createStudioContextPacket: vi.fn(),
  createStudioPromotion: vi.fn(),
  createStudio: vi.fn(),
  createStudioSurface: vi.fn(),
  getStudio: vi.fn(),
  getStudioOverview: vi.fn(),
  invokeChildStudio: vi.fn(),
  listStudioCandidates: vi.fn(),
  listStudioPlaybooks: vi.fn(),
  listStudioPromotions: vi.fn(),
  listStudiosByProject: vi.fn(),
  updateStudioCandidate: vi.fn(),
  updateStudio: vi.fn(),
}));

const repo = await import('../../repositories/studios.js');
const { registerStudioRoutes } = await import('../studios.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerStudioRoutes(app, {
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
  return { response, body: await response.json().catch(() => null) };
}

describe('studio routes', () => {
  let server;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await listen(createApp());
  });
  afterEach(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('creates a studio and returns overview payload', async () => {
    repo.createStudio.mockResolvedValue({
      studio: { id: 'studio-1', title: 'Cell Studio' },
      surfaces: [{ id: 'surface-1', artifactId: 'flow-1', isPrimary: true }],
      counts: { runs: 0, candidates: 0, promotions: 0 },
    });
    const { response, body } = await request(server, '/studios', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-1', title: 'Cell Studio' }),
    });
    expect(response.status).toBe(201);
    expect(body.studio.id).toBe('studio-1');
    expect(body.overview.surfaces[0].artifactId).toBe('flow-1');
  });

  it('adds a studio surface', async () => {
    repo.createStudioSurface.mockResolvedValue({ id: 'surface-1', artifactId: 'flow-1' });
    const { response, body } = await request(server, '/studios/studio-1/surfaces', {
      method: 'POST',
      body: JSON.stringify({ title: 'Deep Dive' }),
    });
    expect(response.status).toBe(201);
    expect(body.surface.id).toBe('surface-1');
    expect(repo.createStudioSurface).toHaveBeenCalledWith('studio-1', { title: 'Deep Dive' });
  });

  it('creates a studio context packet', async () => {
    repo.createStudioContextPacket.mockResolvedValue({ id: 'ctx-1', sourceStudioId: 'studio-1' });
    const { response, body } = await request(server, '/studios/studio-1/context-packets', {
      method: 'POST',
      body: JSON.stringify({ title: 'Selected path' }),
    });
    expect(response.status).toBe(201);
    expect(body.contextPacket.id).toBe('ctx-1');
    expect(repo.createStudioContextPacket).toHaveBeenCalledWith('studio-1', { title: 'Selected path' });
  });

  it('invokes a child studio', async () => {
    repo.invokeChildStudio.mockResolvedValue({
      childStudio: { id: 'child-1' },
      contextPacket: { id: 'ctx-1' },
      step: { id: 'step-1' },
      parentOverview: { studio: { id: 'studio-1' }, childStudios: [{ id: 'child-1' }] },
    });
    const { response, body } = await request(server, '/studios/studio-1/invoke-child', {
      method: 'POST',
      body: JSON.stringify({ title: 'Deep Dive' }),
    });
    expect(response.status).toBe(201);
    expect(body.childStudio.id).toBe('child-1');
    expect(body.parentOverview.childStudios).toHaveLength(1);
    expect(repo.invokeChildStudio).toHaveBeenCalledWith('studio-1', { title: 'Deep Dive' });
  });

  it('lists project studios', async () => {
    repo.listStudiosByProject.mockResolvedValue([{ id: 'studio-1' }]);
    const { response, body } = await request(server, '/projects/project-1/studios');
    expect(response.status).toBe(200);
    expect(body.studios).toEqual([{ id: 'studio-1' }]);
    expect(repo.listStudiosByProject).toHaveBeenCalledWith('project-1', { includeArchived: false });
  });

  it('archives a studio', async () => {
    repo.archiveStudio.mockResolvedValue({ id: 'child-1', state: 'archived' });
    const { response, body } = await request(server, '/studios/child-1/archive', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No longer needed' }),
    });
    expect(response.status).toBe(200);
    expect(body.studio.state).toBe('archived');
    expect(repo.archiveStudio).toHaveBeenCalledWith('child-1', { reason: 'No longer needed' });
  });

  it('restores a studio', async () => {
    repo.restoreStudio.mockResolvedValue({ id: 'child-1', state: 'seeded' });
    const { response, body } = await request(server, '/studios/child-1/restore', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Restored from parent Studio dashboard' }),
    });
    expect(response.status).toBe(200);
    expect(body.studio.state).toBe('seeded');
    expect(repo.restoreStudio).toHaveBeenCalledWith('child-1', { reason: 'Restored from parent Studio dashboard' });
  });

  it('returns archived child studios in overview', async () => {
    repo.getStudioOverview.mockResolvedValue({
      studio: { id: 'parent-1' },
      childStudios: [{ id: 'child-active', title: 'Active child' }],
      archivedChildStudios: [{ id: 'child-archived', title: 'Archived child', archivedAt: '2026-01-01T00:00:00.000Z' }],
    });
    const { response, body } = await request(server, '/studios/parent-1/overview');
    expect(response.status).toBe(200);
    expect(body.overview.childStudios).toHaveLength(1);
    expect(body.overview.archivedChildStudios).toHaveLength(1);
    expect(body.overview.archivedChildStudios[0].id).toBe('child-archived');
  });

  it('creates and applies studio promotion decisions', async () => {
    repo.createStudioCandidate.mockResolvedValue({ id: 'candidate-1' });
    repo.createStudioPromotion.mockResolvedValue({ id: 'promotion-1', status: 'proposed' });
    repo.applyStudioPromotion.mockResolvedValue({ id: 'promotion-1', status: 'applied' });
    const candidate = await request(server, '/studios/child-1/candidates', {
      method: 'POST',
      body: JSON.stringify({ underlyingArtifactId: 'artifact-1' }),
    });
    const promotion = await request(server, '/studios/child-1/promotions', {
      method: 'POST',
      body: JSON.stringify({ candidateArtifactId: 'candidate-1', targetStudioId: 'parent-1' }),
    });
    const applied = await request(server, '/studio-promotions/promotion-1/apply', {
      method: 'POST',
      body: JSON.stringify({ approvedBy: 'user' }),
    });
    expect(candidate.response.status).toBe(201);
    expect(promotion.body.promotion.status).toBe('proposed');
    expect(applied.body.promotion.status).toBe('applied');
  });
});
