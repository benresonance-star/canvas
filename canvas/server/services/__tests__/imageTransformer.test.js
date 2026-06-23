import { describe, expect, it } from 'vitest';
import { createAgentPrompt, runImageTransformer } from '../imageTransformer.js';

describe('imageTransformer', () => {
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
});
