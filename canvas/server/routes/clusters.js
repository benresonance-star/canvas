import {
  getOrCreateClusterForProject,
  resolveClusterId,
  createSubCluster,
  listAllDescendantClusters,
  getClusterMembers,
  addClusterMembers,
  removeClusterMember,
  archiveSubCluster,
  updateCluster,
  resolveProjectIdForCluster,
} from '../repositories/clusters.js';
import { isDbConnectionError } from '../lib/dbError.js';
import {
  publishClusterSync,
  subscribeClusterSync,
  unsubscribeClusterSync,
} from '../lib/clusterSyncHub.js';

async function publishClusterMutation(projectId, clusterId, action) {
  const resolvedProjectId = projectId || await resolveProjectIdForCluster(clusterId);
  publishClusterSync(resolvedProjectId, 'clusters_updated', {
    projectId: resolvedProjectId,
    clusterId,
    action,
    updatedAt: new Date().toISOString(),
  });
}

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean, sendClusterError: Function }} deps */
export function registerClusterRoutes(app, { requireDb, sendClusterError }) {
  app.post('/clusters', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { projectId, name, parentClusterId, purpose, members } = req.body;
      const refs = (members || []).filter((m) => m?.id && m?.type);
      const isSubClusterCreate = Boolean(parentClusterId || (projectId && name?.trim() && refs.length > 0));

      if (isSubClusterCreate) {
        if (!name?.trim()) return res.status(400).json({ error: 'name required' });
        let resolvedParentId = parentClusterId;
        if (!resolvedParentId && projectId) {
          resolvedParentId = await resolveClusterId(projectId);
          if (!resolvedParentId) {
            const workspace = await getOrCreateClusterForProject(projectId, 'Project');
            resolvedParentId = workspace.id;
          }
        }
        if (!resolvedParentId) {
          return res.status(400).json({ error: 'parentClusterId or projectId required' });
        }
        const cluster = await createSubCluster({
          name,
          purpose: purpose ?? null,
          parentClusterId: resolvedParentId,
          members: refs,
        });
        await publishClusterMutation(projectId, cluster.id, 'created');
        return res.json({ cluster });
      }
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const cluster = await getOrCreateClusterForProject(projectId, name || 'Project');
      res.json({ cluster });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/clusters/by-project/:projectId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const clusterId = await resolveClusterId(req.params.projectId);
      if (!clusterId) return res.json({ clusterId: null });
      res.json({ clusterId });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/clusters/by-project/:projectId/subclusters', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const parentId = await resolveClusterId(req.params.projectId);
      if (!parentId) return res.json({ clusters: [] });
      const clusters = await listAllDescendantClusters(parentId);
      res.json({ clusters });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/clusters/:clusterId/members', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const members = await getClusterMembers(req.params.clusterId);
      res.json({ members });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.post('/clusters/:clusterId/members', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const refs = req.body.members || req.body.refs || [];
      await addClusterMembers(req.params.clusterId, refs);
      const members = await getClusterMembers(req.params.clusterId);
      await publishClusterMutation(null, req.params.clusterId, 'members_added');
      res.json({ members });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.delete('/clusters/:clusterId/members', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { id, type } = req.body;
      if (!id || !type) return res.status(400).json({ error: 'id and type required' });
      await removeClusterMember(req.params.clusterId, { id, type });
      await publishClusterMutation(null, req.params.clusterId, 'member_removed');
      res.json({ ok: true });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.patch('/clusters/:clusterId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { name, purpose } = req.body;
      const cluster = await updateCluster(req.params.clusterId, { name, purpose });
      await publishClusterMutation(null, req.params.clusterId, 'updated');
      res.json({ cluster });
    } catch (e) {
      if (isDbConnectionError(e)) {
        return sendClusterError(res, e);
      }
      const status = e.message === 'cluster not found' ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.delete('/clusters/:clusterId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const cluster = await archiveSubCluster(req.params.clusterId);
      await publishClusterMutation(null, req.params.clusterId, 'archived');
      res.json({ cluster });
    } catch (e) {
      if (isDbConnectionError(e)) {
        return sendClusterError(res, e);
      }
      const status = e.message === 'cannot delete workspace cluster' ? 403 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.get('/clusters/by-project/:projectId/stream', async (req, res) => {
    if (!requireDb(res)) return;
    const projectId = req.params.projectId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    subscribeClusterSync(projectId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write('event: heartbeat\ndata: {}\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeClusterSync(projectId, res);
    });

    res.write(
      `event: clusters_ready\ndata: ${JSON.stringify({
        projectId,
        updatedAt: new Date().toISOString(),
      })}\n\n`,
    );
  });
}
