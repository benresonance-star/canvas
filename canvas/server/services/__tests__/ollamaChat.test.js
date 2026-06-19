import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOllamaMessages,
  checkOllamaReachable,
  completeOllamaChat,
} from '../ollamaChat.js';

describe('ollamaChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts multimodal OpenAI-style parts to text-only Ollama messages', () => {
    const messages = buildOllamaMessages({
      systemContext: 'System',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Describe this' },
    ]);
  });

  it('folds Canvas context into the latest user request for local models', () => {
    const messages = buildOllamaMessages({
      systemContext: 'System',
      messages: [
        {
          role: 'user',
          content: '[Canvas context - the following file content is now available]\n\nFile: Brief.md\n\nUse brick.',
        },
        { role: 'assistant', content: 'Ready.' },
        { role: 'user', content: 'Critique this.' },
      ],
    });

    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Ready.' });
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toContain('Use the following Canvas context');
    expect(messages[2].content).toContain('File: Brief.md');
    expect(messages[2].content).toContain('Current user request:\n\nCritique this.');
  });

  it('posts a non-streaming chat request to Ollama', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4:12b',
        message: { content: 'Local reply' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeOllamaChat({
      provider: 'ollama',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.reply).toBe('Local reply');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemma4:12b',
      stream: false,
    });
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Hi' });
  });

  it('uses connectorId to select the Gemma 26B model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4:26b',
        message: { content: 'Bigger local reply' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeOllamaChat({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.model).toBe('gemma4:26b');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gemma4:26b');
  });

  it('checks model availability for the selected connector', async () => {
    const health = await checkOllamaReachable({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
      models: [{ name: 'gemma4:12b' }],
    });

    expect(health.reachable).toBe(true);
    expect(health.modelAvailable).toBe(false);
    expect(health.error).toContain('gemma4:26b');
  });

  it('throws readable Ollama API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'model not found' }),
      }),
    );

    await expect(
      completeOllamaChat({
        provider: 'ollama',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow('model not found');
  });
});
