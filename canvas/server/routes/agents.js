import {
  archiveAgentArtifact,
  createAgentArtifact,
  duplicateAgentArtifact,
  getAgentArtifact,
  listAgentArtifacts,
  updateAgentArtifact,
} from '../repositories/agent-artifacts.js';
import {
  fetchExecution,
  executeAgent,
} from '../services/agentExecutionRunner.js';
import { listExecutionsForAgent } from '../repositories/executions.js';
import { getDecryptedApiKey } from '../repositories/agent-credentials.js';
import { listAgentImageModelOptions } from '../services/agentImageModelOptions.js';

function sendError(res, error) {
  res.status(error.status || (error.message?.includes('not found') ? 404 : 400))
    .json({ error: error.message });
}

function projectIdFromReq(req) {
  return req.params.projectId || req.query.projectId || req.body?.projectId;
}

export function registerAgentsRoutes(app, { requireDb, isDbReady }) {
  app.get(['/agents', '/api/agents', '/projects/:projectId/agents'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const projectId = projectIdFromReq(req);
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      res.json({ agents: await listAgentArtifacts(projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(['/agents', '/api/agents', '/projects/:projectId/agents'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const projectId = projectIdFromReq(req);
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      res.status(201).json({ agent: await createAgentArtifact(projectId, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/agents/model-options', '/api/agents/model-options'], async (req, res) => {
    try {
      const provider = String(req.query.provider || 'local').toLowerCase();
      let apiKey = null;
      if (provider === 'openai' || provider === 'gemini') {
        if (isDbReady?.()) {
          try {
            apiKey = await getDecryptedApiKey(provider);
          } catch {
            apiKey = null;
          }
        }
        if (!apiKey && provider === 'openai') {
          apiKey = process.env.OPENAI_API_KEY || null;
        }
        if (!apiKey && provider === 'gemini') {
          apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
        }
      }
      res.json(await listAgentImageModelOptions(provider, { apiKey }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/agents/:id', '/api/agents/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await getAgentArtifact(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent artifact not found' });
      res.json({ agent });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch(['/agents/:id', '/api/agents/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await updateAgentArtifact(req.params.id, req.body ?? {});
      if (!agent) return res.status(404).json({ error: 'Agent artifact not found' });
      res.json({ agent });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete(['/agents/:id', '/api/agents/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await archiveAgentArtifact(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent artifact not found' });
      res.json({ agent });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(['/agents/:id/duplicate', '/api/agents/:id/duplicate'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await duplicateAgentArtifact(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent artifact not found' });
      res.status(201).json({ agent });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/agents/:id/executions', '/api/agents/:id/executions'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      res.json({ executions: await listExecutionsForAgent(req.params.id, req.query.limit) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get(['/executions/:id', '/api/executions/:id'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const execution = await fetchExecution(req.params.id);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });
      res.json({ execution });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(['/agents/:id/execute', '/api/agents/:id/execute'], async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const execution = await executeAgent(req.params.id, req.body ?? {});
      res.json({
        executionId: execution.id,
        status: execution.status,
        execution,
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}
