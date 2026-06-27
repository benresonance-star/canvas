import {
  addLiveSource,
  createLiveArtifact,
  deleteLiveSource,
  getLiveArtifact,
  listLiveArtifacts,
  listLiveHistory,
  listLiveRuns,
  listLiveSources,
  listProjectUpdates,
  markAllProjectUpdatesRead,
  markLiveExported,
  markProjectUpdateRead,
  updateLiveArtifact,
  updateLiveSource,
} from '../repositories/live-artifacts.js';
import { runLiveArtifact } from '../services/liveArtifactRunner.js';
import { LIVE_MODEL_OPTIONS } from '../../src/features/live/domain/liveArtifact.js';

function sendError(res, error) {
  res.status(error.status || (error.message?.includes('not found') ? 404 : 400))
    .json({ error: error.message });
}

export function registerLiveArtifactRoutes(app, { requireDb }) {
  app.get('/live-artifacts/model-options', (_req, res) => {
    res.json({ models: LIVE_MODEL_OPTIONS });
  });

  app.post('/projects/:projectId/live-artifacts', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const live = await createLiveArtifact(req.params.projectId, req.body ?? {});
      res.status(201).json({ live });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/projects/:projectId/live-artifacts', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({ liveArtifacts: await listLiveArtifacts(req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/live-artifacts/:id', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const live = await getLiveArtifact(req.params.id);
      if (!live) return res.status(404).json({ error: 'Live artifact not found' });
      res.json({ live });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/live-artifacts/:id', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const live = await updateLiveArtifact(req.params.id, req.body ?? {});
      if (!live) return res.status(404).json({ error: 'Live artifact not found' });
      res.json({ live });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/live-artifacts/:id/history', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({ versions: await listLiveHistory(req.params.id, req.query.limit) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/live-artifacts/:id/runs', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({ runs: await listLiveRuns(req.params.id, req.query.limit) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/live-artifacts/:id/sources', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({ sources: await listLiveSources(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/live-artifacts/:id/sources', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.status(201).json({ source: await addLiveSource(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/live-sources/:sourceId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const source = await updateLiveSource(req.params.sourceId, req.body ?? {});
      if (!source) return res.status(404).json({ error: 'Live source not found' });
      res.json({ source });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/live-sources/:sourceId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const deleted = await deleteLiveSource(req.params.sourceId);
      if (!deleted) return res.status(404).json({ error: 'Live source not found or protected' });
      res.status(204).end();
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/live-artifacts/:id/run', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const result = await runLiveArtifact(req.params.id, {
        triggerType: req.body?.triggerType || 'manual',
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/live-artifacts/:id/mark-exported', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const live = await markLiveExported(req.params.id, req.body?.versionId);
      if (!live) return res.status(404).json({ error: 'Live artifact not found' });
      res.json({ live });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/projects/:projectId/updates', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const updates = await listProjectUpdates(req.params.projectId, {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: req.query.limit,
      });
      res.json({ updates, unreadCount: updates.filter((update) => !update.isRead).length });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/project-updates/:id/mark-read', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      if (!await markProjectUpdateRead(req.params.id)) {
        return res.status(404).json({ error: 'Project update not found' });
      }
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/projects/:projectId/updates/mark-read', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const count = await markAllProjectUpdatesRead(req.params.projectId);
      res.json({ ok: true, count });
    } catch (error) {
      sendError(res, error);
    }
  });
}
