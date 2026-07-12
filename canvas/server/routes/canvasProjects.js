import {
  getCanvasIndex,
  putCanvasIndex,
  getCanvasProject,
  getCanvasProjectMeta,
  getCanvasProjectLayout,
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
import { listArtifactViewsByProject } from '../repositories/artifact-views.js';
import { auditProjectUserNoteViews } from '../domain/userNoteArtifactView.js';
import {
  recordArtifactViewDiagnostics,
  summarizeArtifactViewDiagnostics,
} from '../repositories/artifact-view-diagnostics.js';

const ARTIFACT_VIEW_DIAGNOSTIC_CATEGORIES = new Set([
  'loads',
  'eligible_cards',
  'matched_cards',
  'missing_view',
  'identity_mismatch',
  'surface_mismatch',
  'geometry_mismatch',
  'duplicate_view',
  'missing_legacy_card',
  'version_mismatch',
  'read_fallback',
]);

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseExpectedRevision(value) {
  if (value === undefined || value === null) {
    return { ok: false, error: 'expectedRevision required' };
  }
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    return { ok: false, error: 'expectedRevision must be a non-negative integer' };
  }
  return { ok: true, revision };
}

function rejectBadTraceValue(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? null : 'traceId must be a string';
}

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
      const expected = parseExpectedRevision(expectedRevision);
      if (!expected.ok) return res.status(400).json({ error: expected.error });
      const result = await putCanvasIndex(index, expected.revision, {
        deletedProjectIds: Array.isArray(deletedProjectIds) ? deletedProjectIds : [],
        enforceDocumentIntegrity: true,
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

  app.get('/canvas/projects/:projectId/layout', async (req, res) => {
    try {
      const row = await getCanvasProjectLayout(req.params.projectId);
      if (!row) return res.status(404).json({ error: 'project not found' });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId/artifact-views', async (req, res) => {
    try {
      const views = await listArtifactViewsByProject(req.params.projectId, {
        surface: req.query.surface || null,
      });
      res.json({ views });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId/artifact-view-audit', async (req, res) => {
    try {
      const project = await getCanvasProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });
      const views = await listArtifactViewsByProject(req.params.projectId);
      res.json({
        counts: auditProjectUserNoteViews(req.params.projectId, project.payload, views),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/canvas/projects/:projectId/artifact-view-diagnostics', async (req, res) => {
    try {
      const { mode, eventType, counts, metadata } = req.body ?? {};
      if (!['shadow', 'canonical'].includes(mode)) {
        return res.status(400).json({ error: 'invalid artifact view mode' });
      }
      if (!['comparison', 'read_fallback'].includes(eventType)) {
        return res.status(400).json({ error: 'invalid diagnostic event type' });
      }
      if (!isPlainObject(counts) || Object.keys(counts).length === 0) {
        return res.status(400).json({ error: 'diagnostic counts required' });
      }
      for (const [category, count] of Object.entries(counts)) {
        if (!ARTIFACT_VIEW_DIAGNOSTIC_CATEGORIES.has(category)) {
          return res.status(400).json({ error: `invalid diagnostic category: ${category}` });
        }
        if (!Number.isInteger(count) || count < 0 || count > 100000) {
          return res.status(400).json({ error: `invalid diagnostic count: ${category}` });
        }
      }
      const rows = await recordArtifactViewDiagnostics({
        projectId: req.params.projectId,
        mode,
        eventType,
        counts,
        metadata: isPlainObject(metadata) ? metadata : {},
      });
      res.status(202).json({ recorded: rows.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId/artifact-view-diagnostics', async (req, res) => {
    try {
      const requestedHours = Number(req.query.hours ?? 24);
      const hours = Number.isFinite(requestedHours)
        ? Math.min(168, Math.max(1, Math.round(requestedHours)))
        : 24;
      const summary = await summarizeArtifactViewDiagnostics(req.params.projectId, { hours });
      res.json({ hours, summary });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/projects/:projectId', async (req, res) => {
    try {
      const row = await getCanvasProject(req.params.projectId);
      if (!row && req.query.optional === '1') {
        return res.json({ payload: null, updatedAt: null, revision: 0, missing: true });
      }
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
      if (!isPlainObject(payload)) {
        return res.status(400).json({ error: 'payload required' });
      }
      const expected = parseExpectedRevision(expectedRevision);
      if (!expected.ok) return res.status(400).json({ error: expected.error });
      const result = await putCanvasProject(
        req.params.projectId,
        payload,
        expected.revision,
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
      const expected = parseExpectedRevision(expectedRevision);
      if (!expected.ok) return res.status(400).json({ error: expected.error });
      const traceError = rejectBadTraceValue(traceId);
      if (traceError) return res.status(400).json({ error: traceError });
      const projectId = req.params.projectId;
      syncTraceLog(traceId, 'api:patch-received', {
        projectId,
        expectedRevision: expected.revision,
        ...summarizePatchOps(ops),
      });
      const result = await patchCanvasProject(projectId, {
        expectedRevision: expected.revision,
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
