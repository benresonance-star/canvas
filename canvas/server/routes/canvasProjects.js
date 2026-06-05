import {
  getCanvasIndex,
  putCanvasIndex,
  getCanvasProject,
  getCanvasProjectMeta,
  putCanvasProject,
  patchCanvasProject,
  deleteCanvasProject,
} from '../repositories/canvas-projects.js';
import {
  subscribeProjectSync,
  unsubscribeProjectSync,
  publishProjectSync,
} from '../lib/projectSyncHub.js';
import { summarizePatchOps, syncTraceLog } from '../../src/lib/sync/syncTrace.js';
import {
  subscribeWorkspaceIndexSync,
  unsubscribeWorkspaceIndexSync,
  publishWorkspaceIndexSync,
} from '../lib/workspaceIndexSyncHub.js';
import { deletePreviewBlobsForProject } from '../repositories/canvas-previews.js';

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean }} deps */
export function registerCanvasProjectRoutes(app, { requireDb }) {
  app.get('/canvas/index', async (_req, res) => {
    try {
      const row = await getCanvasIndex();
      res.json({
        index: row?.payload ?? null,
        updatedAt: row?.updatedAt ?? null,
        revision: row?.revision ?? 0,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/canvas/index', async (req, res) => {
    try {
      const { index, expectedRevision, clientId, deletedProjectIds } = req.body;
      if (!index || !Array.isArray(index.projects)) {
        return res.status(400).json({ error: 'index with projects array required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      for (const row of index.projects) {
        if (!row?.id) continue;
        const meta = await getCanvasProjectMeta(row.id);
        if (!meta) {
          console.warn(
            `[canvas] workspace index lists project ${row.id} but canvas_project_document is missing`,
          );
        }
      }
      const result = await putCanvasIndex(index, expectedRevision, {
        deletedProjectIds: Array.isArray(deletedProjectIds) ? deletedProjectIds : [],
      });
      if (!result.ok) {
        return res.status(409).json({
          error: 'conflict',
          revision: result.revision,
          index: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      publishWorkspaceIndexSync('index_updated', {
        revision: result.revision,
        updatedAt: result.updatedAt,
        clientId: clientId ?? null,
      });
      res.json({
        updatedAt: result.updatedAt,
        revision: result.revision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/index/stream', async (req, res) => {
    if (!requireDb(res)) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    subscribeWorkspaceIndexSync(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: {}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeWorkspaceIndexSync(res);
    });

    try {
      const row = await getCanvasIndex();
      if (row) {
        res.write(
          `event: revision\ndata: ${JSON.stringify({
            revision: row.revision,
            updatedAt: row.updatedAt,
          })}\n\n`,
        );
      }
    } catch {
      /* best effort */
    }
  });

  app.get('/canvas/projects/:projectId/meta', async (req, res) => {
    try {
      const row = await getCanvasProjectMeta(req.params.projectId);
      if (!row) return res.status(404).json({ error: 'project not found' });
      res.json({ revision: row.revision, updatedAt: row.updatedAt });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId', async (req, res) => {
    try {
      const row = await getCanvasProject(req.params.projectId);
      if (!row) return res.status(404).json({ error: 'project not found' });
      res.json({
        payload: row.payload,
        updatedAt: row.updatedAt,
        revision: row.revision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/canvas/projects/:projectId', async (req, res) => {
    try {
      const {
        payload,
        expectedRevision,
        allowEmptyRemoteOverwrite,
        allowDockOnlyRemoteOverwrite,
      } = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'payload required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const result = await putCanvasProject(
        req.params.projectId,
        payload,
        expectedRevision,
        {
          allowEmptyRemoteOverwrite: allowEmptyRemoteOverwrite === true,
          allowDockOnlyRemoteOverwrite: allowDockOnlyRemoteOverwrite === true,
        },
      );
      if (!result.ok) {
        return res.status(409).json({
          error: result.reason || 'conflict',
          revision: result.revision,
          payload: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      res.json({ revision: result.revision, updatedAt: result.updatedAt });
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('too large') || msg.includes('payload')) {
        return res.status(413).json({ error: 'Project document too large for server storage' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/canvas/projects/:projectId', async (req, res) => {
    try {
      const {
        ops,
        expectedRevision,
        clientId,
        reason,
        traceId,
        allowEmptyRemoteOverwrite,
        allowDockOnlyRemoteOverwrite,
      } = req.body;
      if (!Array.isArray(ops) || ops.length === 0) {
        return res.status(400).json({ error: 'ops required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const projectId = req.params.projectId;
      syncTraceLog(traceId, 'api:patch-received', {
        projectId,
        expectedRevision,
        ...summarizePatchOps(ops),
      });
      const result = await patchCanvasProject(projectId, {
        expectedRevision,
        ops,
        traceId,
        allowEmptyRemoteOverwrite: allowEmptyRemoteOverwrite === true,
        allowDockOnlyRemoteOverwrite:
          allowDockOnlyRemoteOverwrite === true
          || reason === 'placementTransfer:dock',
      });
      if (!result.ok) {
        const status = result.reason ? 400 : 409;
        syncTraceLog(traceId, 'api:patch-rejected', {
          projectId,
          status,
          error: result.reason || 'conflict',
          revision: result.revision,
        });
        return res.status(status).json({
          error: result.reason || 'conflict',
          revision: result.revision,
          payload: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      syncTraceLog(traceId, 'api:patch-ok', {
        projectId,
        revision: result.revision,
      });
      publishProjectSync(projectId, 'project_updated', {
        revision: result.revision,
        updatedAt: result.updatedAt,
        ops,
        clientId: clientId ?? null,
        reason: reason ?? null,
        traceId: traceId ?? null,
      });
      syncTraceLog(traceId, 'api:sse-published', { projectId, revision: result.revision });
      res.json({
        revision: result.revision,
        updatedAt: result.updatedAt,
      });
    } catch (e) {
      syncTraceLog(req.body?.traceId, 'api:patch-error', {
        projectId: req.params.projectId,
        error: e.message,
      });
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId/stream', async (req, res) => {
    const projectId = req.params.projectId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    subscribeProjectSync(projectId, res);
    syncTraceLog(`sse-${projectId}`, 'api:sse-subscribe', { projectId });

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: {}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeProjectSync(projectId, res);
      syncTraceLog(`sse-${projectId}`, 'api:sse-unsubscribe', { projectId });
    });

    try {
      const meta = await getCanvasProjectMeta(projectId);
      if (meta) {
        res.write(
          `event: revision\ndata: ${JSON.stringify({
            revision: meta.revision,
            updatedAt: meta.updatedAt,
          })}\n\n`,
        );
      }
    } catch {
      /* ignore */
    }
  });

  app.delete('/canvas/projects/:projectId', async (req, res) => {
    try {
      await deleteCanvasProject(req.params.projectId);
      await deletePreviewBlobsForProject(req.params.projectId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
