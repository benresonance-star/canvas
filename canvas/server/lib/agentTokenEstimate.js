import { encodingForModel } from 'js-tiktoken';
import { getConnectorByProvider } from './agentConnectors.js';
import { buildChatMessages } from '../services/openaiChat.js';
import { estimateInputCostUsd } from './agentPricing.js';

const FALLBACK_ENCODING = 'gpt-4o';

/**
 * @param {string} model
 */
function getEncoding(model) {
  try {
    return encodingForModel(model);
  } catch {
    return encodingForModel(FALLBACK_ENCODING);
  }
}

const IMAGE_PART_TOKEN_ESTIMATE = 850;

/**
 * @param {string | object[]} content
 * @param {ReturnType<typeof encodingForModel>} enc
 */
function countMessageContentTokens(content, enc) {
  if (typeof content === 'string') {
    return enc.encode(content).length;
  }
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const part of content) {
    if (part?.type === 'text' && part.text) {
      total += enc.encode(part.text).length;
    } else if (part?.type === 'image_url' && part.image_url?.url) {
      total += IMAGE_PART_TOKEN_ESTIMATE;
    }
  }
  return total;
}

/**
 * @param {{ provider: string, messages: object[], systemContext?: string }} params
 */
export function estimateChatInputTokens({ provider, messages, systemContext }) {
  const connector = getConnectorByProvider(provider);
  if (!connector) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const chatMessages = buildChatMessages({ systemContext, messages });
  const enc = getEncoding(connector.model);
  let total = 0;
  for (const m of chatMessages) {
    total += countMessageContentTokens(m.content, enc) + 4;
  }
  total += 2;

  const estimatedInputUsd = estimateInputCostUsd(connector.model, total);

  return {
    inputTokens: total,
    model: connector.model,
    estimatedInputUsd: Math.round(estimatedInputUsd * 1_000_000) / 1_000_000,
  };
}
