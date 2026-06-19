import { describe, it, expect } from 'vitest';
import { estimateChatInputTokens } from '../agentTokenEstimate.js';
import { buildChatMessages } from '../../services/openaiChat.js';

describe('agentTokenEstimate', () => {
  it('counts tokens for chat messages', () => {
    const result = estimateChatInputTokens({
      provider: 'openai',
      messages: [{ role: 'user', content: 'Hello' }],
      systemContext: 'Focus on item A',
    });
    expect(result.inputTokens).toBeGreaterThan(10);
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.estimatedInputUsd).toBeGreaterThan(0);
  });

  it('normalizes provider-prefixed template models', () => {
    const result = estimateChatInputTokens({
      provider: 'openai',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'Hello' }],
      systemContext: 'Focus on item A',
    });
    expect(result.model).toBe('gpt-5.5');
    expect(result.inputTokens).toBeGreaterThan(10);
  });

  it('buildChatMessages includes system context', () => {
    const msgs = buildChatMessages({
      systemContext: 'test context',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('test context');
  });

  it('counts extra tokens for multimodal image parts', () => {
    const textOnly = estimateChatInputTokens({
      provider: 'openai',
      messages: [{ role: 'user', content: 'Describe this.' }],
    });
    const withImage = estimateChatInputTokens({
      provider: 'openai',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
    });
    expect(withImage.inputTokens).toBeGreaterThan(textOnly.inputTokens);
  });
});
