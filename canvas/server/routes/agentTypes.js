import {
  createAgentType,
  deleteAgentType,
  getAgentType,
  listAgentTypes,
  listSkillsRulesToolsTransformers,
  updateAgentType,
} from '../repositories/agent-types.js';

function sendError(res, error) {
  res.status(error.status || (error.message?.includes('not found') ? 404 : 400))
    .json({ error: error.message });
}

export function registerAgentTypeRoutes(app, { requireDb }) {
  app.get(['/agent-types', '/api/agent-types'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({
        agentTypes: await listAgentTypes({ includeArchived: req.query.includeArchived === 'true' }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(['/agent-types', '/api/agent-types'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.status(201).json({ agentType: await createAgentType(req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/agent-types/catalog', '/api/agent-types/catalog'], async (_req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json(await listSkillsRulesToolsTransformers());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/agent-types/:id', '/api/agent-types/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agentType = await getAgentType(req.params.id);
      if (!agentType) return res.status(404).json({ error: 'Agent type not found' });
      res.json({ agentType });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch(['/agent-types/:id', '/api/agent-types/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agentType = await updateAgentType(req.params.id, req.body ?? {});
      if (!agentType) return res.status(404).json({ error: 'Agent type not found' });
      res.json({ agentType });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete(['/agent-types/:id', '/api/agent-types/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agentType = await deleteAgentType(req.params.id);
      if (!agentType) return res.status(404).json({ error: 'Agent type not found' });
      res.json({ agentType });
    } catch (error) {
      sendError(res, error);
    }
  });
}
