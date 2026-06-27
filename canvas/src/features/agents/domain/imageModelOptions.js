export const IMAGE_MODEL_LABELS = Object.freeze({
  'gpt-image-2': 'GPT Image 2',
  'gpt-image-2-2026-04-21': 'GPT Image 2',
  'gpt-image-1.5': 'GPT Image 1.5',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1-mini': 'GPT Image 1 Mini',
  'dall-e-3': 'DALL·E 3',
  'dall-e-2': 'DALL·E 2',
  'placeholder-png': 'Local placeholder',
  'gemini-3.1-flash-image': 'Gemini 3.1 Flash Image',
  'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash Image (Preview)',
  'gemini-3-pro-image': 'Gemini 3 Pro Image',
  'gemini-3-pro-image-preview': 'Gemini 3 Pro Image (Preview)',
  'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
  'gemini-2.0-flash-preview-image-generation': 'Gemini 2.0 Flash (Image)',
  default: 'Default workflow',
});

export const FALLBACK_IMAGE_MODEL_OPTIONS = Object.freeze({
  openai: [
    { provider: 'openai', model: 'gpt-image-2', label: IMAGE_MODEL_LABELS['gpt-image-2'] },
    { provider: 'openai', model: 'gpt-image-1.5', label: IMAGE_MODEL_LABELS['gpt-image-1.5'] },
    { provider: 'openai', model: 'gpt-image-1', label: IMAGE_MODEL_LABELS['gpt-image-1'] },
    { provider: 'openai', model: 'gpt-image-1-mini', label: IMAGE_MODEL_LABELS['gpt-image-1-mini'] },
    { provider: 'openai', model: 'dall-e-3', label: IMAGE_MODEL_LABELS['dall-e-3'] },
    { provider: 'openai', model: 'dall-e-2', label: IMAGE_MODEL_LABELS['dall-e-2'] },
  ],
  local: [
    { provider: 'local', model: 'placeholder-png', label: IMAGE_MODEL_LABELS['placeholder-png'] },
  ],
  gemini: [
    {
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      label: IMAGE_MODEL_LABELS['gemini-3.1-flash-image'],
    },
    {
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      label: IMAGE_MODEL_LABELS['gemini-3.1-flash-image-preview'],
    },
    {
      provider: 'gemini',
      model: 'gemini-3-pro-image',
      label: IMAGE_MODEL_LABELS['gemini-3-pro-image'],
    },
    {
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      label: IMAGE_MODEL_LABELS['gemini-3-pro-image-preview'],
    },
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      label: IMAGE_MODEL_LABELS['gemini-2.5-flash-image'],
    },
    {
      provider: 'gemini',
      model: 'gemini-2.0-flash-preview-image-generation',
      label: IMAGE_MODEL_LABELS['gemini-2.0-flash-preview-image-generation'],
    },
  ],
  comfyui: [
    { provider: 'comfyui', model: 'default', label: IMAGE_MODEL_LABELS.default },
  ],
});

export function labelForImageModel(model) {
  if (!model) return '';
  return IMAGE_MODEL_LABELS[model] || model;
}

export function formatGeneratedImageModelLabel({ provider, model } = {}) {
  if (model) return labelForImageModel(model);
  if (provider === 'local') return IMAGE_MODEL_LABELS['placeholder-png'];
  if (provider) return provider;
  return null;
}

export function isOpenAiImageModelId(modelId) {
  const normalized = String(modelId || '').toLowerCase();
  return normalized.startsWith('gpt-image') || normalized.startsWith('dall-e');
}

export function normalizeGeminiModelId(modelId) {
  return String(modelId || '').replace(/^models\//i, '');
}

export function isGeminiImageModelId(modelId) {
  const normalized = normalizeGeminiModelId(modelId).toLowerCase();
  if (!normalized.startsWith('gemini-') && !normalized.startsWith('imagen-')) {
    return false;
  }
  return normalized.includes('-image') || normalized.includes('image-generation');
}

/**
 * Merge API-discovered model ids with curated fallback ordering and labels.
 * @param {string} provider
 * @param {string[]} fetchedModelIds
 */
export function mergeImageModelOptions(provider, fetchedModelIds = []) {
  const fallback = [...(FALLBACK_IMAGE_MODEL_OPTIONS[provider] || FALLBACK_IMAGE_MODEL_OPTIONS.local)];
  const byModel = new Map(fallback.map((entry) => [entry.model, entry]));
  for (const modelId of fetchedModelIds) {
    if (byModel.has(modelId)) continue;
    byModel.set(modelId, {
      provider,
      model: modelId,
      label: labelForImageModel(modelId),
    });
  }
  const ordered = [];
  for (const entry of fallback) {
    if (byModel.has(entry.model)) {
      ordered.push(byModel.get(entry.model));
      byModel.delete(entry.model);
    }
  }
  for (const entry of byModel.values()) {
    ordered.push(entry);
  }
  return ordered.length ? ordered : fallback;
}

export function defaultModelForProvider(provider) {
  const options = FALLBACK_IMAGE_MODEL_OPTIONS[provider] || FALLBACK_IMAGE_MODEL_OPTIONS.local;
  return options[0]?.model ?? null;
}
