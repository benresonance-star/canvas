import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/openaiFetch.js', () => ({
  fetchOpenAI: vi.fn(),
}));

import { fetchOpenAI } from '../../lib/openaiFetch.js';
import { listAgentImageModelOptions } from '../agentImageModelOptions.js';

describe('listAgentImageModelOptions', () => {
  beforeEach(() => {
    vi.mocked(fetchOpenAI).mockReset();
  });

  it('returns static models for local provider', async () => {
    const result = await listAgentImageModelOptions('local');
    expect(result.source).toBe('static');
    expect(result.models[0]).toMatchObject({ model: 'placeholder-png' });
  });

  it('returns fallback OpenAI models when no api key', async () => {
    const result = await listAgentImageModelOptions('openai', { apiKey: null });
    expect(result.source).toBe('fallback');
    expect(result.models.map((entry) => entry.model)).toContain('gpt-image-2');
  });

  it('fetches OpenAI image models when api key is available', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'gpt-image-1' },
          { id: 'dall-e-3' },
        ],
      }),
    });
    const result = await listAgentImageModelOptions('openai', { apiKey: 'sk-test' });
    expect(result.source).toBe('api');
    expect(result.models.map((entry) => entry.model)).toEqual([
      'gpt-image-2',
      'gpt-image-1.5',
      'gpt-image-1',
      'gpt-image-1-mini',
      'dall-e-3',
      'dall-e-2',
    ]);
  });

  it('returns fallback Gemini models when no api key', async () => {
    const result = await listAgentImageModelOptions('gemini', { apiKey: null });
    expect(result.source).toBe('fallback');
    expect(result.models.map((entry) => entry.model)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image',
      'gemini-3-pro-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-preview-image-generation',
    ]);
  });

  it('fetches Gemini image models when api key is available', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-3.1-pro-preview' },
          { name: 'models/gemini-3.1-flash-image' },
          { name: 'models/gemini-2.5-flash-image' },
        ],
      }),
    });
    const result = await listAgentImageModelOptions('gemini', { apiKey: 'gem-test' });
    expect(result.source).toBe('api');
    expect(result.models.map((entry) => entry.model)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image',
      'gemini-3-pro-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-preview-image-generation',
    ]);
  });
});
