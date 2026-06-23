import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/agent-credentials.js', () => ({
  listConnectorStatus: vi.fn(),
  saveCredential: vi.fn(),
  deleteCredential: vi.fn(),
  getDecryptedApiKey: vi.fn(),
  secretsAvailable: vi.fn(() => true),
}));

vi.mock('../../repositories/agent-templates.js', () => ({
  getAgentTemplate: vi.fn(),
}));

vi.mock('../../services/openaiChat.js', async () => {
  const actual = await vi.importActual('../../services/openaiChat.js');
  return {
    ...actual,
    completeChat: vi.fn(),
  };
});

vi.mock('../../services/ollamaChat.js', () => ({
  checkOllamaReachable: vi.fn(() => ({
    reachable: true,
    modelAvailable: true,
    error: null,
  })),
  completeOllamaChat: vi.fn(),
  pullOllamaModel: vi.fn(),
}));

vi.mock('../../lib/agentTokenEstimate.js', () => ({
  estimateChatInputTokens: vi.fn(),
}));

vi.mock('../../lib/openaiFetch.js', () => ({
  checkOpenaiReachable: vi.fn(() => ({ reachable: true })),
}));

const credentials = await import('../../repositories/agent-credentials.js');
const templates = await import('../../repositories/agent-templates.js');
const chat = await import('../../services/openaiChat.js');
const ollama = await import('../../services/ollamaChat.js');
const tokenEstimate = await import('../../lib/agentTokenEstimate.js');
const { registerAgentRoutes } = await import('../agent.js');

function createApp() {
  const app = express();
  app.use(express.json());
  registerAgentRoutes(app);
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function jsonRequest(server, path, init = {}) {
  const res = await fetch(`${baseUrl(server)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json();
  return { res, body };
}

async function textRequest(server, path, init = {}) {
  const res = await fetch(`${baseUrl(server)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  return { res, body };
}

describe('agent routes', () => {
  let server = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    credentials.getDecryptedApiKey.mockResolvedValue('sk-test');
    chat.completeChat.mockResolvedValue({ reply: 'ok', model: 'openai/gpt-5.5' });
    ollama.completeOllamaChat.mockResolvedValue({ reply: 'local ok', model: 'gemma4:12b' });
    tokenEstimate.estimateChatInputTokens.mockReturnValue({
      inputTokens: 10,
      model: 'openai/gpt-5.5',
      estimatedInputUsd: 0.00001,
    });
    templates.getAgentTemplate.mockResolvedValue({
      id: 'brainstorming',
      label: 'Brainstorming Agent',
      provider: 'openai',
      model: 'openai/gpt-5.5',
      enabled: true,
      instructions: 'You are a brainstorming agent.',
      skills: [],
      tools: [],
    });
    server = await listen(createApp());
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  });

  it('uses template system context and model for chat', async () => {
    const { res, body } = await jsonRequest(server, '/agent/chat', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'openai',
        templateId: 'brainstorming',
        systemContext: 'Base',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(body.templateId).toBe('brainstorming');
    expect(chat.completeChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'sk-test',
      provider: 'openai',
      model: 'openai/gpt-5.5',
      systemContext: expect.stringContaining('You are a brainstorming agent.'),
    }));
  });

  it('routes Ollama chat without decrypting an API key', async () => {
    templates.getAgentTemplate.mockResolvedValue(null);

    const { res, body } = await jsonRequest(server, '/agent/chat', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'ollama',
        systemContext: 'Base',
        messages: [{ role: 'user', content: 'Hi local model' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(body.reply).toBe('local ok');
    expect(credentials.getDecryptedApiKey).not.toHaveBeenCalled();
    expect(ollama.completeOllamaChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: null,
      provider: 'ollama',
      messages: [{ role: 'user', content: 'Hi local model' }],
      systemContext: 'Base',
      model: null,
    }));
  });

  it('passes connectorId through for Gemma 26B Ollama chat', async () => {
    templates.getAgentTemplate.mockResolvedValue(null);
    ollama.completeOllamaChat.mockResolvedValue({ reply: 'local 26b', model: 'gemma4:26b' });

    const { res, body } = await jsonRequest(server, '/agent/chat', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'ollama',
        connectorId: 'ollama-gemma-26b',
        systemContext: 'Base',
        messages: [{ role: 'user', content: 'Hi bigger local model' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(body.model).toBe('gemma4:26b');
    expect(credentials.getDecryptedApiKey).not.toHaveBeenCalled();
    expect(ollama.completeOllamaChat).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
      model: null,
    }));
  });

  it('rejects unknown chat providers', async () => {
    const { res, body } = await jsonRequest(server, '/agent/chat', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'bad-provider',
        messages: [],
      }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toContain('Unknown');
  });

  it('reports Ollama health fields', async () => {
    ollama.checkOllamaReachable.mockResolvedValue({
      reachable: true,
      modelAvailable: true,
      error: null,
    });

    const { res, body } = await jsonRequest(server, '/agent/health');

    expect(res.status).toBe(200);
    expect(body.ollamaReachable).toBe(true);
    expect(body.ollamaModelAvailable).toBe(true);
    expect(body.ollamaReachabilityError).toBe(null);
  });

  it('returns connector status including Ollama metadata', async () => {
    credentials.listConnectorStatus.mockResolvedValue([
      {
        id: 'ollama-gemma-12b',
        label: 'Gemma 12B Local',
        provider: 'ollama',
        model: 'gemma4:12b',
        configured: true,
        usable: true,
        requiresCredential: false,
      },
    ]);

    const { res, body } = await jsonRequest(server, '/agent/connectors');

    expect(res.status).toBe(200);
    expect(body.connectors).toContainEqual(expect.objectContaining({
      id: 'ollama-gemma-12b',
      provider: 'ollama',
      requiresCredential: false,
      usable: true,
    }));
  });

  it('rejects templates for another provider', async () => {
    templates.getAgentTemplate.mockResolvedValue({
      id: 'bad',
      provider: 'anthropic',
      model: 'claude',
      enabled: true,
    });

    const { res, body } = await jsonRequest(server, '/agent/estimate', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'openai',
        templateId: 'bad',
        messages: [],
      }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toContain('provider');
    expect(tokenEstimate.estimateChatInputTokens).not.toHaveBeenCalled();
  });

  it('short-circuits Ollama pull when model is already present', async () => {
    ollama.checkOllamaReachable.mockResolvedValue({
      reachable: true,
      modelAvailable: true,
      error: null,
    });

    const { res, body } = await jsonRequest(server, '/agent/ollama/pull', {
      method: 'POST',
      body: JSON.stringify({ connectorId: 'ollama-gemma-26b' }),
    });

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      alreadyPresent: true,
      model: 'gemma4:26b',
    });
    expect(ollama.pullOllamaModel).not.toHaveBeenCalled();
  });

  it('streams Ollama pull progress for missing models', async () => {
    ollama.checkOllamaReachable.mockResolvedValue({
      reachable: true,
      modelAvailable: false,
      error: 'Ollama is running, but gemma4:26b is not pulled.',
    });
    ollama.pullOllamaModel.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ status: 'downloading', completed: 1, total: 2 });
      return { model: 'gemma4:26b' };
    });

    const { res, body } = await textRequest(server, '/agent/ollama/pull', {
      method: 'POST',
      body: JSON.stringify({ connectorId: 'ollama-gemma-26b' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(body).toContain('"status":"downloading"');
    expect(body).toContain('"ok":true');
    expect(ollama.pullOllamaModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemma4:26b',
    }));
  });

  it('rejects Ollama pull for unknown connectors', async () => {
    const { res, body } = await jsonRequest(server, '/agent/ollama/pull', {
      method: 'POST',
      body: JSON.stringify({ connectorId: 'openai' }),
    });

    expect(res.status).toBe(400);
    expect(body.error).toContain('Unknown');
  });
});
