import {
  deleteBimStylePreset,
  getBimStylePreset,
  listBimStylePresets,
  saveBimStylePreset,
  updateBimStylePreset,
} from '../repositories/bim-style-presets.js';

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean, sendClusterError: Function }} deps */
export function registerBimRoutes(app, { requireDb, sendClusterError }) {
  app.post('/bim/projects/:projectId/style-presets', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await saveBimStylePreset(req.params.projectId, req.body ?? {});
      res.status(201).json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/bim/projects/:projectId/style-presets', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const cardId = typeof req.query.cardId === 'string' && req.query.cardId.trim()
        ? req.query.cardId.trim()
        : null;
      const presets = await listBimStylePresets(req.params.projectId, { cardId });
      res.json({ presets });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/bim/style-presets/:presetId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await getBimStylePreset(req.params.presetId);
      if (!preset) return res.status(404).json({ error: 'bim style preset not found' });
      res.json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.patch('/bim/style-presets/:presetId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await updateBimStylePreset(req.params.presetId, req.body ?? {});
      if (!preset) return res.status(404).json({ error: 'bim style preset not found' });
      res.json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.delete('/bim/style-presets/:presetId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await deleteBimStylePreset(req.params.presetId);
      if (!preset) return res.status(404).json({ error: 'bim style preset not found' });
      res.json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });
}
