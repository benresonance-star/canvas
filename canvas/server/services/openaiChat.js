import { getConnectorByProvider } from '../lib/agentConnectors.js';
import { fetchOpenAI } from '../lib/openaiFetch.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_HISTORY = 20;

export const BASE_AGENT_SYSTEM =
  'You are a helpful assistant embedded in Canvas, a spatial workspace for architecture and design projects. Answer concisely and practically.';

export function buildSystemMessage(systemContext) {
  const trimmed = systemContext?.trim();
  if (!trimmed) return BASE_AGENT_SYSTEM;
  return trimmed;
}

function isValidContentPart(part) {
  if (!part || typeof part !== 'object') return false;
  if (part.type === 'text' && typeof part.text === 'string') return true;
  if (part.type === 'image_url' && typeof part.image_url?.url === 'string') return true;
  return false;
}

/**
 * @param {string | object[]} content
 */
export function normalizeMessageContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = content.filter(isValidContentPart);
  return parts.length ? parts : '';
}

export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (m) =>
        m
        && (m.role === 'user' || m.role === 'assistant')
        && m.content != null
        && m.content !== '',
    )
    .map((m) => ({
      role: m.role,
      content: normalizeMessageContent(m.content),
    }))
    .filter((m) => !(Array.isArray(m.content) && m.content.length === 0))
    .slice(-MAX_HISTORY);
}

/**
 * @param {{ systemContext?: string, messages?: object[] }} params
 */
export function buildChatMessages({ systemContext, messages }) {
  const history = normalizeMessages(messages);
  return [{ role: 'system', content: buildSystemMessage(systemContext) }, ...history];
}

/**
 * @param {{ apiKey: string, provider: string, messages: object[], systemContext?: string }} params
 */
export async function completeChat({ apiKey, provider, messages, systemContext }) {
  const connector = getConnectorByProvider(provider);
  if (!connector) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const payload = {
    model: connector.model,
    messages: buildChatMessages({ systemContext, messages }),
  };

  let res;
  try {
    res = await fetchOpenAI(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[agent] OpenAI chat request failed:', e.message, e.cause ?? '');
    throw e;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `OpenAI request failed (${res.status})`;
    throw new Error(msg);
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('No reply from OpenAI.');
  }

  return {
    reply,
    model: data.model || connector.model,
    usage: data.usage ?? null,
  };
}
