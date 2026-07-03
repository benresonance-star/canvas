import {
  applyStudioPromotion,
  archiveStudio,
  createStudioCandidate,
  createStudioContextPacket,
  createStudioPromotion,
  createStudio,
  createStudioSurface,
  getStudio,
  getStudioOverview,
  invokeChildStudio,
  listStudioCandidates,
  listStudioPlaybooks,
  listStudioPromotions,
  listStudiosByProject,
  restoreStudio,
  updateStudioCandidate,
  updateStudio,
} from '../repositories/studios.js';

export function registerStudioRoutes(app, { requireDb, sendClusterError } = {}) {
  app.get('/studio-playbooks', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const playbooks = await listStudioPlaybooks({ studioKind: req.query.studioKind ?? null });
      res.json({ playbooks });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });

  app.post('/studios', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const overview = await createStudio(req.body ?? {});
      res.status(201).json({ studio: overview.studio, overview });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.get('/studios/:studioId', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const studio = await getStudio(req.params.studioId);
      if (!studio) return res.status(404).json({ error: 'studio not found' });
      res.json({ studio });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });

  app.patch('/studios/:studioId', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const studio = await updateStudio(req.params.studioId, req.body ?? {});
      if (!studio) return res.status(404).json({ error: 'studio not found' });
      res.json({ studio });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/archive', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const studio = await archiveStudio(req.params.studioId, req.body ?? {});
      if (!studio) return res.status(404).json({ error: 'studio not found' });
      res.json({ studio });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/restore', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const studio = await restoreStudio(req.params.studioId, req.body ?? {});
      if (!studio) return res.status(404).json({ error: 'studio not found' });
      res.json({ studio });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.get('/studios/:studioId/overview', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const overview = await getStudioOverview(req.params.studioId);
      if (!overview) return res.status(404).json({ error: 'studio not found' });
      res.json({ overview });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/surfaces', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const surface = await createStudioSurface(req.params.studioId, req.body ?? {});
      res.status(201).json({ surface });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/context-packets', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const contextPacket = await createStudioContextPacket(req.params.studioId, req.body ?? {});
      res.status(201).json({ contextPacket });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/invoke-child', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const result = await invokeChildStudio(req.params.studioId, req.body ?? {});
      res.status(201).json(result);
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.get('/studios/:studioId/candidates', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      res.json({ candidates: await listStudioCandidates(req.params.studioId) });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/candidates', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const candidate = await createStudioCandidate(req.params.studioId, req.body ?? {});
      res.status(201).json({ candidate });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.patch('/studio-candidates/:candidateId', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const candidate = await updateStudioCandidate(req.params.candidateId, req.body ?? {});
      if (!candidate) return res.status(404).json({ error: 'candidate not found' });
      res.json({ candidate });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.get('/studios/:studioId/promotions', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      res.json({ promotions: await listStudioPromotions(req.params.studioId) });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });

  app.post('/studios/:studioId/promotions', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const promotion = await createStudioPromotion(req.params.studioId, req.body ?? {});
      res.status(201).json({ promotion });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.post('/studio-promotions/:promotionId/apply', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const promotion = await applyStudioPromotion(req.params.promotionId, req.body ?? {});
      res.json({ promotion });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(400).json({ error: error.message });
    }
  });

  app.get('/projects/:projectId/studios', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const studios = await listStudiosByProject(req.params.projectId, {
        includeArchived: req.query.includeArchived === 'true',
      });
      res.json({ studios });
    } catch (error) {
      sendClusterError ? sendClusterError(res, error) : res.status(500).json({ error: error.message });
    }
  });
}
