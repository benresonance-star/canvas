import { getConnectorById, isAllowedProvider } from '../lib/agentConnectors.js';
import {
  listConnectorStatus,
  saveCredential,
  deleteCredential,
  getDecryptedApiKey,
  secretsAvailable,
} from '../repositories/agent-credentials.js';
import {
  chatProviderRequiresCredential,
  completeAgentChat,
} from '../services/agentChatProvider.js';
import { estimateChatInputTokens } from '../lib/agentTokenEstimate.js';
import { checkOpenaiReachable } from '../lib/openaiFetch.js';
import { checkOllamaReachable } from '../services/ollamaChat.js';
import { getAgentTemplate } from '../repositories/agent-templates.js';
import { compileAgentTemplateSystemContext } from '../../src/lib/agentTemplates.js';

const AGENT_SYSTEM_CONTEXT_MAX_CHARS = 120_000;

function validateConnectorForProvider(provider, connectorId) {
  if (!connectorId) return null;
  const connector = getConnectorById(connectorId);
  if (!connector || connector.provider !== provider) {
    const err = new Error('Unknown connector for provider');
    err.status = 400;
    throw err;
  }
  return connector;
}

async function resolveTemplateContext({ provider, templateId, systemContext }) {
  if (!templateId) {
    return { systemContext, model: null, template: null };
  }
  const template = await getAgentTemplate(templateId);
  if (!template) {
    const err = new Error('Agent template not found');
    err.status = 404;
    throw err;
  }
  if (!template.enabled) {
    const err = new Error('Agent template is disabled');
    err.status = 400;
    throw err;
  }
  if (template.provider !== provider) {
    const err = new Error('Agent template provider does not match selected provider');
    err.status = 400;
    throw err;
  }
  return {
    systemContext: compileAgentTemplateSystemContext(systemContext, template),
    model: template.model,
    template,
  };
}

/** @param {import('express').Express} app */
export function registerAgentRoutes(app) {
  app.get('/agent/health', async (_req, res) => {
    try {
      const [openai, ollama] = await Promise.all([
        checkOpenaiReachable(),
        checkOllamaReachable(),
      ]);
      res.json({
        secretsConfigured: secretsAvailable(),
        openaiReachable: openai.reachable,
        openaiReachabilityError: openai.error ?? null,
        ollamaReachable: ollama.reachable,
        ollamaModelAvailable: ollama.modelAvailable,
        ollamaReachabilityError: ollama.error ?? null,
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
      if (!chatProviderRequiresCredential(provider)) {
        return res.status(400).json({ error: 'This agent does not use an API key' });
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
      if (!chatProviderRequiresCredential(provider)) {
        return res.status(400).json({ error: 'This agent does not use an API key' });
      }
      await deleteCredential(provider);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/agent/estimate', async (req, res) => {
    try {
      const { provider, connectorId, messages, systemContext, templateId } = req.body;
      if (!provider || !isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown or missing provider' });
      }
      validateConnectorForProvider(provider, connectorId);
      const resolved = await resolveTemplateContext({ provider, templateId, systemContext });
      if (
        resolved.systemContext
        && String(resolved.systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS
      ) {
        return res.status(400).json({
          error: `Context is too large (${String(resolved.systemContext).length} characters). Select fewer items.`,
        });
      }
      const result = estimateChatInputTokens({
        provider,
        connectorId,
        messages: messages || [],
        systemContext: resolved.systemContext,
        model: resolved.model,
      });
      res.json({ ...result, templateId: resolved.template?.id ?? null });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  });

  app.post('/agent/chat', async (req, res) => {
    try {
      const { provider, connectorId, messages, systemContext, templateId } = req.body;
      if (!provider || !isAllowedProvider(provider)) {
        return res.status(400).json({ error: 'Unknown or missing provider' });
      }
      validateConnectorForProvider(provider, connectorId);
      const resolved = await resolveTemplateContext({ provider, templateId, systemContext });
      if (
        resolved.systemContext
        && String(resolved.systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS
      ) {
        return res.status(400).json({
          error: `Context is too large (${String(resolved.systemContext).length} characters). Select fewer items.`,
        });
      }
      let apiKey = null;
      if (chatProviderRequiresCredential(provider)) {
        apiKey = await getDecryptedApiKey(provider);
      }
      if (chatProviderRequiresCredential(provider) && !apiKey) {
        return res.status(400).json({ error: 'API key not configured for this agent' });
      }
      const result = await completeAgentChat({
        apiKey,
        provider,
        connectorId,
        messages: messages || [],
        systemContext: resolved.systemContext,
        model: resolved.model,
      });
      res.json({ ...result, templateId: resolved.template?.id ?? null });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });
}
