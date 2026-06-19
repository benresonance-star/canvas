import {
  getConnectorById,
  getConnectorByProvider,
  normalizeProviderModelId,
} from '../lib/agentConnectors.js';
import { buildChatMessages } from './openaiChat.js';

const CHAT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 3_000;
const CANVAS_CONTEXT_PREFIX = '[Canvas context';

function connectorBaseUrl(connector) {
  return String(connector?.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
}

function resolveConnector({ provider = 'ollama', connectorId = null } = {}) {
  const connector = connectorId
    ? getConnectorById(connectorId)
    : getConnectorByProvider(provider);
  if (!connector) return null;
  if (provider && connector.provider !== provider) return null;
  return connector;
}

function textOnlyContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n\n');
}

function isCanvasContextMessage(message) {
  return message.role === 'user' && message.content.trim().startsWith(CANVAS_CONTEXT_PREFIX);
}

function foldCanvasContextIntoLatestUserTurn(messages) {
  const contextMessages = messages.filter(isCanvasContextMessage);
  if (!contextMessages.length) return messages;

  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user' && !isCanvasContextMessage(message),
  );
  if (latestUserIndex === -1) return messages;

  const contextBlock = contextMessages
    .map((message) => message.content.trim())
    .join('\n\n---\n\n');

  return messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => !isCanvasContextMessage(message))
    .map(({ message, index }) => {
      if (index !== latestUserIndex) return message;
      return {
        ...message,
        content: [
          'Use the following Canvas context as source material for this request.',
          contextBlock,
          'Current user request:',
          message.content,
        ].join('\n\n'),
      };
    });
}

export function buildOllamaMessages({ systemContext, messages }) {
  const normalizedMessages = buildChatMessages({ systemContext, messages })
    .map((message) => ({
      role: message.role,
      content: textOnlyContent(message.content),
    }))
    .filter((message) => message.content.trim());

  return foldCanvasContextIntoLatestUserTurn(normalizedMessages);
}

/**
 * @param {{ provider: string, connectorId?: string | null, messages: object[], systemContext?: string, model?: string | null }} params
 */
export async function completeOllamaChat({
  provider,
  connectorId = null,
  messages,
  systemContext,
  model = null,
}) {
  const connector = resolveConnector({ provider, connectorId });
  if (!connector) {
    throw new Error(connectorId ? `Unknown connector: ${connectorId}` : `Unknown provider: ${provider}`);
  }
  const resolvedModel = normalizeProviderModelId(provider, model || connector.model);
  const baseUrl = connectorBaseUrl(connector);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: resolvedModel,
        messages: buildOllamaMessages({ systemContext, messages }),
        stream: false,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Ollama at ${baseUrl}. Start the Ollama Docker container and pull ${resolvedModel}. ${e.message}`,
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      `Ollama request failed (${res.status})`;
    throw new Error(msg);
  }

  const reply = data?.message?.content;
  if (!reply) {
    throw new Error('No reply from Ollama.');
  }

  return {
    reply,
    model: data.model || resolvedModel,
    usage: null,
  };
}

/**
 * @param {{ baseUrl?: string | null }} [params]
 */
export async function fetchOllamaTags({ baseUrl = 'http://localhost:11434' } = {}) {
  const normalizedBaseUrl = String(baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  try {
    const res = await fetch(`${normalizedBaseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        reachable: false,
        models: [],
        error: `Ollama health check failed (${res.status}).`,
      };
    }
    const models = Array.isArray(data?.models) ? data.models : [];
    return {
      reachable: true,
      models,
      error: null,
    };
  } catch {
    return {
      reachable: false,
      models: [],
      error: `Cannot reach Ollama at ${normalizedBaseUrl}.`,
    };
  }
}

/**
 * @param {{ provider?: string, connectorId?: string | null, models?: object[] | null }} [params]
 */
export async function checkOllamaReachable({
  provider = 'ollama',
  connectorId = null,
  models = null,
} = {}) {
  const connector = resolveConnector({ provider, connectorId });
  if (!connector) {
    return {
      reachable: false,
      modelAvailable: false,
      error: connectorId ? `Unknown connector: ${connectorId}` : `Unknown provider: ${provider}`,
    };
  }

  const baseUrl = connectorBaseUrl(connector);
  const resolvedModel = normalizeProviderModelId(provider, connector.model);
  const tags = Array.isArray(models) ? { reachable: true, models, error: null } : await fetchOllamaTags({ baseUrl });
  if (!tags.reachable) {
    return {
      reachable: false,
      modelAvailable: false,
      error: tags.error,
    };
  }
  const modelAvailable = tags.models.some((entry) => entry?.name === resolvedModel);
  return {
    reachable: true,
    modelAvailable,
    error: modelAvailable ? null : `Ollama is running, but ${resolvedModel} is not pulled.`,
  };
}
