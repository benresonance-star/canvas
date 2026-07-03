import {
  createStateMachine,
  getStateMachineById,
  listStateMachines,
  updateStateMachine,
} from '../repositories/state-machines.js';
import {
  createStateMachineRequestSchema,
  parseRequest,
  updateStateMachineRequestSchema,
} from '../schemas/artifacts.js';

function sendError(res, error) {
  const status = error.status || (error.message?.includes('not found') ? 404 : 400);
  res.status(status).json({ error: error.message });
}

/** @param {import('express').Express} app */
export function registerStateMachineRoutes(app, { requireDb } = {}) {
  app.post('/state-machines', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const input = parseRequest(createStateMachineRequestSchema, req.body);
      const stateMachine = await createStateMachine(input);
      res.status(201).json({ stateMachine });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/state-machines/:id', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const stateMachine = await getStateMachineById(req.params.id);
      if (!stateMachine) return res.status(404).json({ error: 'State machine not found' });
      res.json({ stateMachine });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/projects/:projectId/state-machines', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const stateMachines = await listStateMachines(req.params.projectId);
      res.json({ stateMachines });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/state-machines/:id', async (req, res) => {
    if (requireDb && !requireDb(res)) return;
    try {
      const input = parseRequest(updateStateMachineRequestSchema, req.body);
      const stateMachine = await updateStateMachine(req.params.id, input);
      if (!stateMachine) return res.status(404).json({ error: 'State machine not found' });
      res.json({ stateMachine });
    } catch (error) {
      sendError(res, error);
    }
  });
}
