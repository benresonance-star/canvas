import { isAllowedProvider } from '../lib/agentConnectors.js';
import {
  listConnectorStatus,
  saveCredential,
  deleteCredential,
  getDecryptedApiKey,
  secretsAvailable,
} from '../repositories/agent-credentials.js';
import { completeChat } from '../services/openaiChat.js';
import { estimateChatInputTokens } from '../lib/agentTokenEstimate.js';
import { checkOpenaiReachable } from '../lib/openaiFetch.js';

const AGENT_SYSTEM_CONTEXT_MAX_CHARS = 120_000;

/** @param {import('express').Express} app */
export function registerAgentRoutes(app) {
  app.get('/agent/health', async (_req, res) => {
    try {
      const openai = await checkOpenaiReachable();
      res.json({
        secretsConfigured: secretsAvailable(),
        openaiReachable: openai.reachable,
        openaiReachabilityError: openai.error ?? null,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/agent/connectors', async (_req, res) => {
    try {
      const connectors = await listConnectorStatus();
      res.json({ connectors, secretsConfigured: secretsAvailable() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/agent/credentials/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      if (!isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown provider' });
      }
      if (!secretsAvailable()) {
        return res.status(503).json({
          error:
            'Server cannot store API keys. Ensure the API can write canvas/.data/agent-master.key or set AGENT_SECRETS_KEY.',
        });
      }
      const { apiKey } = req.body;
      const { keyHint } = await saveCredential(provider, apiKey);
      res.json({ ok: true, keyHint });
    } catch (e) {
      const status = e.message.includes('AGENT_SECRETS_KEY') ? 503 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.delete('/agent/credentials/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      if (!isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown provider' });
      }
      await deleteCredential(provider);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/agent/estimate', async (req, res) => {
    try {
      const { provider, messages, systemContext } = req.body;
      if (!provider || !isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown or missing provider' });
      }
      if (systemContext && String(systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS) {
        return res.status(400).json({
          error: `Context is too large (${String(systemContext).length} characters). Select fewer items.`,
        });
      }
      const result = estimateChatInputTokens({
        provider,
        messages: messages || [],
        systemContext,
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/agent/chat', async (req, res) => {
    try {
      const { provider, messages, systemContext } = req.body;
      if (!provider || !isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown or missing provider' });
      }
      if (systemContext && String(systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS) {
        return res.status(400).json({
          error: `Context is too large (${String(systemContext).length} characters). Select fewer items.`,
        });
      }
      const apiKey = await getDecryptedApiKey(provider);
      if (!apiKey) {
        return res.status(400).json({ error: 'API key not configured for this agent' });
      }
      const result = await completeChat({
        apiKey,
        provider,
        messages: messages || [],
        systemContext,
      });
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
}
