import { describe, expect, it } from 'vitest';
import {
  isGeminiImageModelId,
  isOpenAiImageModelId,
  mergeImageModelOptions,
  labelForImageModel,
  defaultModelForProvider,
  formatGeneratedImageModelLabel,
} from '../imageModelOptions.js';

describe('imageModelOptions', () => {
  it('detects OpenAI image model ids', () => {
    expect(isOpenAiImageModelId('gpt-image-1')).toBe(true);
    expect(isOpenAiImageModelId('dall-e-3')).toBe(true);
    expect(isOpenAiImageModelId('gpt-4o-mini')).toBe(false);
  });

  it('detects Gemini image model ids', () => {
    expect(isGeminiImageModelId('gemini-3.1-flash-image')).toBe(true);
    expect(isGeminiImageModelId('models/gemini-3.1-flash-image')).toBe(true);
    expect(isGeminiImageModelId('gemini-2.0-flash-preview-image-generation')).toBe(true);
    expect(isGeminiImageModelId('gemini-3.1-pro-preview')).toBe(false);
  });

  it('defaults Gemini to the newest image model', () => {
    expect(defaultModelForProvider('gemini')).toBe('gemini-3.1-flash-image');
  });

  it('formats generated image model labels for artifact metadata', () => {
    expect(formatGeneratedImageModelLabel({
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
    })).toBe('Gemini 3.1 Flash Image');
    expect(formatGeneratedImageModelLabel({ provider: 'openai', model: 'gpt-image-2' })).toBe('GPT Image 2');
  });

  it('labels known models with friendly names', () => {
    expect(labelForImageModel('gpt-image-1')).toBe('GPT Image 1');
    expect(labelForImageModel('custom-model')).toBe('custom-model');
  });

  it('merges API ids with curated fallback order', () => {
    const merged = mergeImageModelOptions('openai', ['dall-e-2', 'gpt-image-1-mini']);
    expect(merged.map((entry) => entry.model)).toEqual([
      'gpt-image-2',
      'gpt-image-1.5',
      'gpt-image-1',
      'gpt-image-1-mini',
      'dall-e-3',
      'dall-e-2',
    ]);
    expect(merged.find((entry) => entry.model === 'gpt-image-1-mini')?.label).toBe('GPT Image 1 Mini');
  });
});
