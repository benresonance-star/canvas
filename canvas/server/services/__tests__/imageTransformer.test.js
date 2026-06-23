import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/openaiFetch.js', () => ({
  fetchOpenAI: vi.fn(),
}));

import { fetchOpenAI } from '../../lib/openaiFetch.js';
import { createAgentPrompt, runImageTransformer } from '../imageTransformer.js';

describe('imageTransformer', () => {
  beforeEach(() => {
    vi.mocked(fetchOpenAI).mockReset();
  });

  it('creates an agent prompt from goal, instructions, and source prompt', () => {
    const prompt = createAgentPrompt({
      goal: 'Render a facade',
      instructions: 'Keep materials consistent',
      prompt: 'Townhouse with brick fins',
    });
    expect(prompt).toContain('Render a facade');
    expect(prompt).toContain('Keep materials consistent');
    expect(prompt).toContain('Townhouse with brick fins');
  });

  it('returns deterministic PNG data URLs for the requested image count', async () => {
    const result = await runImageTransformer({
      prompt: 'A courtyard house',
      provider: 'local',
      settings: {
        aspectRatio: '16:9',
        imageCount: 2,
      },
    });
    expect(result.images).toHaveLength(2);
    expect(result.images[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.images[0].width).toBe(640);
    expect(result.images[0].height).toBe(360);
    expect(result.images[0].contentHash).not.toBe(result.images[1].contentHash);
  });

  it('posts text-only OpenAI requests to the image generation endpoint', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-image-1',
        usage: { total_tokens: 272 },
        data: [{ b64_json: Buffer.from('image-bytes').toString('base64') }],
      }),
    });

    const result = await runImageTransformer({
      provider: 'openai',
      apiKey: 'sk-test',
      prompt: 'A courtyard house',
      settings: {
        aspectRatio: '16:9',
        imageCount: 1,
        outputFormat: 'jpeg',
        quality: 'draft',
      },
    });

    expect(fetchOpenAI).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(fetchOpenAI).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'A courtyard house',
      size: '1536x1024',
      quality: 'low',
      output_format: 'jpeg',
      n: 1,
    });
    expect(result.images[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.usage).toEqual({ total_tokens: 272 });
  });

  it('posts source image bytes to the OpenAI image edit endpoint', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-image-1',
        usage: { total_tokens: 644 },
        data: [{ b64_json: Buffer.from('edited-image').toString('base64') }],
      }),
    });

    await runImageTransformer({
      provider: 'openai',
      apiKey: 'sk-test',
      prompt: 'Use the uploaded facade as reference',
      references: [{
        id: 'artifact-image',
        type: 'image',
        payload_text: `data:image/png;base64,${Buffer.from('source-image').toString('base64')}`,
        metadata: {},
      }],
      settings: {
        aspectRatio: '1:1',
        imageCount: 1,
        outputFormat: 'png',
        quality: 'standard',
      },
    });

    expect(fetchOpenAI).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(fetchOpenAI).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get('model')).toBe('gpt-image-1');
    expect(request.body.get('prompt')).toBe('Use the uploaded facade as reference');
    expect(request.body.get('size')).toBe('1024x1024');
    expect(request.body.get('quality')).toBe('medium');
    expect(request.body.get('n')).toBe('1');
    expect(request.body.getAll('image[]')).toHaveLength(1);
    expect(request.body.getAll('image')).toHaveLength(0);
  });

  it('fails clearly when an image reference has no available bytes', async () => {
    await expect(
      runImageTransformer({
        provider: 'openai',
        apiKey: 'sk-test',
        prompt: 'Use the selected reference',
        references: [{
          id: 'folder-backed-image',
          type: 'image',
          payload_text: null,
          metadata: { filename: 'source.png' },
        }],
        settings: { imageCount: 1 },
      }),
    ).rejects.toThrow('Connected reference images are not available');
    expect(fetchOpenAI).not.toHaveBeenCalled();
  });
});
