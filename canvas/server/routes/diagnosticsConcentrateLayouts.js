import {
  getConcentrateLayout,
  listConcentrateLayouts,
  putConcentrateLayout,
} from '../repositories/diagnostics-concentrate-layouts.js';

function parseSpecVersion(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function parseActionId(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean, sendClusterError: Function }} deps */
export function registerDiagnosticsConcentrateLayoutRoutes(app, { requireDb, sendClusterError }) {
  app.get('/canvas/diagnostics/concentrate-layouts', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const specVersion = parseSpecVersion(req.query.specVersion);
      if (!specVersion) {
        return res.status(400).json({ error: 'specVersion query param required' });
      }
      const layouts = await listConcentrateLayouts(specVersion);
      res.json({ layouts, specVersion });
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/canvas/diagnostics/concentrate-layouts/:actionId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const actionId = parseActionId(req.params.actionId);
      const specVersion = parseSpecVersion(req.query.specVersion);
      if (!actionId) {
        return res.status(400).json({ error: 'actionId required' });
      }
      if (!specVersion) {
        return res.status(400).json({ error: 'specVersion query param required' });
      }
      const layout = await getConcentrateLayout(actionId, specVersion);
      if (!layout) {
        return res.status(404).json({ error: 'layout not found' });
      }
      res.json(layout);
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.put('/canvas/diagnostics/concentrate-layouts/:actionId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const actionId = parseActionId(req.params.actionId);
      const specVersion = parseSpecVersion(req.body?.specVersion ?? req.query.specVersion);
      if (!actionId) {
        return res.status(400).json({ error: 'actionId required' });
      }
      if (!specVersion) {
        return res.status(400).json({ error: 'specVersion required' });
      }
      const layout = await putConcentrateLayout(actionId, specVersion, {
        nodeOverrides: req.body?.nodeOverrides,
        edgeAnchors: req.body?.edgeAnchors,
      });
      res.json(layout);
    } catch (e) {
      sendClusterError(res, e);
    }
  });
}
