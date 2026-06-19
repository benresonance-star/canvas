import { encodingForModel } from 'js-tiktoken';
import {
  getConnectorById,
  getConnectorByProvider,
  normalizeProviderModelId,
} from './agentConnectors.js';
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
 * @param {{ provider: string, connectorId?: string | null, messages: object[], systemContext?: string, model?: string | null }} params
 */
export function estimateChatInputTokens({
  provider,
  connectorId = null,
  messages,
  systemContext,
  model = null,
}) {
  const connector = connectorId
    ? getConnectorById(connectorId)
    : getConnectorByProvider(provider);
  if (!connector) {
    throw new Error(connectorId ? `Unknown connector: ${connectorId}` : `Unknown provider: ${provider}`);
  }
  const resolvedModel = normalizeProviderModelId(provider, model || connector.model);

  const chatMessages = buildChatMessages({ systemContext, messages });
  const enc = getEncoding(resolvedModel);
  let total = 0;
  for (const m of chatMessages) {
    total += countMessageContentTokens(m.content, enc) + 4;
  }
  total += 2;

  const estimatedInputUsd =
    provider === 'openai'
      ? estimateInputCostUsd(resolvedModel, total)
      : 0;

  return {
    inputTokens: total,
    model: resolvedModel,
    estimatedInputUsd: Math.round(estimatedInputUsd * 1_000_000) / 1_000_000,
  };
}
