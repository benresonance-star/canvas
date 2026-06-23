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

function dataUrlToBase64(url) {
  const value = String(url ?? '').trim();
  if (!value) return null;
  const comma = value.indexOf(',');
  if (value.startsWith('data:') && comma >= 0) {
    return value.slice(comma + 1).replace(/\s/g, '');
  }
  return value.replace(/\s/g, '');
}

/**
 * @param {string | object[]} content
 * @returns {{ content: string, images: string[] }}
 */
function ollamaMessageFromContent(content) {
  if (typeof content === 'string') {
    return { content, images: [] };
  }
  if (!Array.isArray(content)) {
    return { content: '', images: [] };
  }

  const textParts = [];
  const images = [];
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      textParts.push(part.text);
      continue;
    }
    if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
      const base64 = dataUrlToBase64(part.image_url.url);
      if (base64) images.push(base64);
    }
  }

  return {
    content: textParts.join('\n\n'),
    images,
  };
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
  const contextImages = contextMessages.flatMap((message) => message.images ?? []);

  return messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => !isCanvasContextMessage(message))
    .map(({ message, index }) => {
      if (index !== latestUserIndex) return message;
      const mergedImages = [...(message.images ?? []), ...contextImages];
      return {
        ...message,
        content: [
          'Use the following Canvas context as source material for this request.',
          contextBlock,
          'Current user request:',
          message.content,
        ].join('\n\n'),
        ...(mergedImages.length ? { images: mergedImages } : {}),
      };
    });
}

function toOllamaApiMessage(message) {
  const apiMessage = {
    role: message.role,
    content: message.content,
  };
  if (message.images?.length) {
    apiMessage.images = message.images;
  }
  return apiMessage;
}

export function buildOllamaMessages({ systemContext, messages }) {
  const normalizedMessages = buildChatMessages({ systemContext, messages })
    .map((message) => ({
      role: message.role,
      ...ollamaMessageFromContent(message.content),
    }))
    .filter((message) => message.content.trim() || message.images.length);

  return foldCanvasContextIntoLatestUserTurn(normalizedMessages).map(toOllamaApiMessage);
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

/**
 * @param {string} line
 */
function parseOllamaNdjsonLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * @param {{ baseUrl?: string, model: string, signal?: AbortSignal, onProgress?: (event: object) => void }} params
 */
export async function pullOllamaModel({
  baseUrl = 'http://localhost:11434',
  model,
  signal,
  onProgress,
} = {}) {
  const normalizedBaseUrl = String(baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const resolvedModel = String(model || '').trim();
  if (!resolvedModel) {
    throw new Error('Model name is required.');
  }

  let res;
  try {
    res = await fetch(`${normalizedBaseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: resolvedModel, stream: true }),
      signal,
    });
  } catch (e) {
    throw new Error(`Cannot reach Ollama at ${normalizedBaseUrl}. ${e.message}`);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Ollama pull failed (${res.status})`);
  }

  if (!res.body) {
    throw new Error('Ollama pull returned no response body.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = parseOllamaNdjsonLine(line);
      if (!event) continue;
      onProgress?.(event);
      if (event.status === 'success') {
        return { model: event.model || resolvedModel };
      }
      if (event.status === 'error') {
        throw new Error(event.error || 'Ollama pull failed');
      }
    }
  }

  const trailing = parseOllamaNdjsonLine(buffer);
  if (trailing) {
    onProgress?.(trailing);
    if (trailing.status === 'success') {
      return { model: trailing.model || resolvedModel };
    }
    if (trailing.status === 'error') {
      throw new Error(trailing.error || 'Ollama pull failed');
    }
  }

  throw new Error('Ollama pull ended without success');
}
