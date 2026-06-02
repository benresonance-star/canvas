import {
  getAgentChatSession,
  putAgentChatSession,
  deleteAgentChatSession,
  getAgentChatThreadIndex,
  putAgentChatThreadIndex,
  LEGACY_THREAD_ID,
} from '../repositories/canvas-agent-chat.js';

/** @param {import('express').Express} app */
export function registerCanvasAgentChatRoutes(app) {
  app.get('/canvas/agent-chat/:projectId/:connectorId/threads', async (req, res) => {
    try {
      const row = await getAgentChatThreadIndex(
        req.params.projectId,
        req.params.connectorId,
      );
      if (!row) return res.json({ index: null, updatedAt: null, revision: 0 });
      res.json({
        index: row.payload,
        updatedAt: row.updatedAt,
        revision: row.revision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/canvas/agent-chat/:projectId/:connectorId/threads', async (req, res) => {
    try {
      const { index, expectedRevision } = req.body;
      if (!index || typeof index !== 'object') {
        return res.status(400).json({ error: 'index object required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const result = await putAgentChatThreadIndex(
        req.params.projectId,
        req.params.connectorId,
        index,
        expectedRevision,
      );
      if (!result.ok) {
        return res.status(409).json({
          error: 'conflict',
          revision: result.revision,
          index: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      res.json({ updatedAt: result.updatedAt, revision: result.revision });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
    try {
      const { threadId } = req.params;
      if (threadId === 'threads') {
        return res.status(404).json({ error: 'not found' });
      }
      const row = await getAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        threadId,
      );
      if (!row) return res.json({ session: null, updatedAt: null, revision: 0 });
      res.json({
        session: row.payload,
        updatedAt: row.updatedAt,
        revision: row.revision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
    try {
      const { threadId } = req.params;
      if (threadId === 'threads') {
        return res.status(400).json({ error: 'invalid thread id' });
      }
      const { session, expectedRevision } = req.body;
      if (!session || typeof session !== 'object') {
        return res.status(400).json({ error: 'session object required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const result = await putAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        session,
        threadId,
        expectedRevision,
      );
      if (!result.ok) {
        return res.status(409).json({
          error: 'conflict',
          revision: result.revision,
          session: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      res.json({ updatedAt: result.updatedAt, revision: result.revision });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
    try {
      const { threadId } = req.params;
      if (threadId === 'threads') {
        return res.status(400).json({ error: 'invalid thread id' });
      }
      await deleteAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        threadId,
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** @deprecated Legacy single-session routes (thread_id = legacy) */
  app.get('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
    try {
      const row = await getAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        LEGACY_THREAD_ID,
      );
      if (!row) return res.json({ session: null, updatedAt: null, revision: 0 });
      res.json({
        session: row.payload,
        updatedAt: row.updatedAt,
        revision: row.revision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
    try {
      const { session, expectedRevision } = req.body;
      if (!session || typeof session !== 'object') {
        return res.status(400).json({ error: 'session object required' });
      }
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const result = await putAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        session,
        LEGACY_THREAD_ID,
        expectedRevision,
      );
      if (!result.ok) {
        return res.status(409).json({
          error: 'conflict',
          revision: result.revision,
          session: result.payload,
          updatedAt: result.updatedAt,
        });
      }
      res.json({ updatedAt: result.updatedAt, revision: result.revision });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
    try {
      await deleteAgentChatSession(
        req.params.projectId,
        req.params.connectorId,
        LEGACY_THREAD_ID,
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
