import { listClusterPrimitives, getPrimitiveDetail } from '../repositories/primitives-list.js';
import { listClusterEvents } from '../repositories/events-list.js';
import { buildClusterGraph } from '../repositories/graph.js';

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean, sendClusterError: Function }} deps */
export function registerPrimitiveRoutes(app, { requireDb, sendClusterError }) {
  app.get('/clusters/:clusterId/primitives', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { type, limit } = req.query;
      const data = await listClusterPrimitives(req.params.clusterId, {
        type: type || undefined,
        limit: limit ? Number(limit) : 100,
      });
      res.json(data);
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/clusters/:clusterId/events', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { limit } = req.query;
      const data = await listClusterEvents(req.params.clusterId, {
        limit: limit ? Number(limit) : 200,
      });
      res.json(data);
    } catch (e) {
      sendClusterError(res, e);
    }
  });

  app.get('/primitives/:type/:id', async (req, res) => {
    try {
      const detail = await getPrimitiveDetail(req.params.type, req.params.id);
      if (!detail) return res.status(404).json({ error: 'not found' });
      res.json(detail);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/clusters/:clusterId/graph', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const graph = await buildClusterGraph(req.params.clusterId);
      res.json(graph);
    } catch (e) {
      sendClusterError(res, e);
    }
  });
}
