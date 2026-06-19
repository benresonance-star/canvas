import { createFlow, deleteFlow, getFlow, replaceFlow } from '../repositories/flows.js';
import { publishFlowEvent, subscribeFlowEvents } from '../flowEvents.js';

export function registerFlowRoutes(app, { requireDb, sendClusterError }) {
  app.post('/projects/:projectId/flows', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const flow = await createFlow(req.params.projectId, req.body ?? {});
      publishFlowEvent({ type: 'flow_created', flowId: flow.id, revision: flow.revision });
      res.status(201).json({ flow });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/flows/:flowId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const flow = await getFlow(req.params.flowId);
      if (!flow) return res.status(404).json({ error: 'flow not found' });
      res.json({ flow });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/flows/:flowId/stream', (req, res) => {
    if (!requireDb(res)) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    const unsubscribe = subscribeFlowEvents((event) => {
      if (event.flowId !== req.params.flowId) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.put('/flows/:flowId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { expectedRevision, clientId = null, ...snapshot } = req.body ?? {};
      const flow = await replaceFlow(req.params.flowId, expectedRevision, snapshot);
      publishFlowEvent({
        type: 'flow_updated',
        flowId: flow.id,
        revision: flow.revision,
        clientId,
      });
      res.json({ flow });
    } catch (error) {
      if (error.code === 'FLOW_CONFLICT') {
        return res.status(409).json({ error: error.message, currentRevision: error.currentRevision });
      }
      if (error.code === 'FLOW_NOT_FOUND') return res.status(404).json({ error: error.message });
      sendClusterError(res, error);
    }
  });

  app.delete('/flows/:flowId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const deleted = await deleteFlow(req.params.flowId);
      if (!deleted) return res.status(404).json({ error: 'flow not found' });
      publishFlowEvent({ type: 'flow_deleted', flowId: req.params.flowId });
      res.status(204).end();
    } catch (error) {
      sendClusterError(res, error);
    }
  });
}
