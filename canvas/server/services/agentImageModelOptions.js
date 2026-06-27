import {
  FALLBACK_IMAGE_MODEL_OPTIONS,
  isGeminiImageModelId,
  isOpenAiImageModelId,
  mergeImageModelOptions,
  normalizeGeminiModelId,
} from '../../src/features/agents/domain/imageModelOptions.js';
import { fetchOpenAI } from '../lib/openaiFetch.js';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function fetchGeminiImageModelIds(apiKey) {
  const modelIds = [];
  let pageToken = null;

  do {
    const url = new URL(GEMINI_MODELS_URL);
    url.searchParams.set('key', apiKey);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }
    const response = await fetchOpenAI(url.toString(), { timeoutMs: 15_000 });
    if (!response.ok) {
      throw new Error(`Gemini models request failed (${response.status})`);
    }
    const body = await response.json();
    for (const entry of body?.models ?? []) {
      const modelId = normalizeGeminiModelId(entry?.name);
      if (isGeminiImageModelId(modelId)) {
        modelIds.push(modelId);
      }
    }
    pageToken = body?.nextPageToken || null;
  } while (pageToken);

  return modelIds;
}

/**
 * @param {string} provider
 * @param {{ apiKey?: string | null }} [options]
 */
export async function listAgentImageModelOptions(provider, { apiKey = null } = {}) {
  const normalized = String(provider || 'local').toLowerCase();

  if (normalized === 'openai') {
    if (!apiKey) {
      return {
        provider: normalized,
        models: [...FALLBACK_IMAGE_MODEL_OPTIONS.openai],
        source: 'fallback',
      };
    }
    try {
      const response = await fetchOpenAI(OPENAI_MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 15_000,
      });
      if (!response.ok) {
        throw new Error(`OpenAI models request failed (${response.status})`);
      }
      const body = await response.json();
      const modelIds = (body?.data ?? [])
        .map((entry) => entry?.id)
        .filter((id) => isOpenAiImageModelId(id));
      return {
        provider: normalized,
        models: mergeImageModelOptions('openai', modelIds),
        source: 'api',
      };
    } catch {
      return {
        provider: normalized,
        models: [...FALLBACK_IMAGE_MODEL_OPTIONS.openai],
        source: 'fallback',
      };
    }
  }

  if (normalized === 'gemini') {
    if (!apiKey) {
      return {
        provider: normalized,
        models: [...FALLBACK_IMAGE_MODEL_OPTIONS.gemini],
        source: 'fallback',
      };
    }
    try {
      const modelIds = await fetchGeminiImageModelIds(apiKey);
      return {
        provider: normalized,
        models: mergeImageModelOptions('gemini', modelIds),
        source: 'api',
      };
    } catch {
      return {
        provider: normalized,
        models: [...FALLBACK_IMAGE_MODEL_OPTIONS.gemini],
        source: 'fallback',
      };
    }
  }

  const models = FALLBACK_IMAGE_MODEL_OPTIONS[normalized] || FALLBACK_IMAGE_MODEL_OPTIONS.local;
  return {
    provider: normalized,
    models: [...models],
    source: 'static',
  };
}
