import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/clusters.js', () => ({
  getOrCreateClusterForProject: vi.fn(),
  resolveClusterId: vi.fn(),
  createSubCluster: vi.fn(),
  listAllDescendantClusters: vi.fn(),
  getClusterMembers: vi.fn(),
  addClusterMembers: vi.fn(),
  removeClusterMember: vi.fn(),
  archiveSubCluster: vi.fn(),
  updateCluster: vi.fn(),
  resolveProjectIdForCluster: vi.fn(),
}));

vi.mock('../../repositories/project-primitives.js', () => ({
  deleteProjectArtifactRef: vi.fn(),
}));

vi.mock('../../lib/clusterSyncHub.js', () => ({
  publishClusterSync: vi.fn(),
  subscribeClusterSync: vi.fn(),
  unsubscribeClusterSync: vi.fn(),
}));

const projectPrimitiveRepo = await import('../../repositories/project-primitives.js');
const clusterSyncHub = await import('../../lib/clusterSyncHub.js');
const { registerClusterRoutes } = await import('../clusters.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerClusterRoutes(app, {
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

async function jsonRequest(server, path, options = {}) {
  const res = await fetch(`${baseUrl(server)}${path}`, options);
  const body = await res.json();
  return { res, body };
}

describe('cluster routes', () => {
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

  it('DELETE /projects/:projectId/artifacts/:artifactId cleans project artifact scope', async () => {
    projectPrimitiveRepo.deleteProjectArtifactRef.mockResolvedValue({
      membershipCount: 1,
      deletedArtifactCount: 1,
    });

    const { res, body } = await jsonRequest(
      server,
      '/projects/project-1/artifacts/artifact-1',
      { method: 'DELETE' },
    );

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      cleanup: {
        membershipCount: 1,
        deletedArtifactCount: 1,
      },
    });
    expect(projectPrimitiveRepo.deleteProjectArtifactRef).toHaveBeenCalledWith(
      'project-1',
      'artifact-1',
    );
    expect(clusterSyncHub.publishClusterSync).toHaveBeenCalledWith(
      'project-1',
      'clusters_updated',
      expect.objectContaining({
        projectId: 'project-1',
        artifactId: 'artifact-1',
        action: 'artifact_removed',
      }),
    );
  });
});
