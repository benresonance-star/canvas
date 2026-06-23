import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOllamaMessages,
  checkOllamaReachable,
  completeOllamaChat,
  pullOllamaModel,
} from '../ollamaChat.js';

describe('ollamaChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts multimodal OpenAI-style parts to Ollama messages with images', () => {
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
      { role: 'user', content: 'Describe this', images: ['abc'] },
    ]);
  });

  it('keeps text-only messages without an images field', () => {
    const messages = buildOllamaMessages({
      systemContext: 'System',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(messages).toEqual([
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(messages[1]).not.toHaveProperty('images');
  });

  it('folds Canvas context images into the latest user request for local models', () => {
    const messages = buildOllamaMessages({
      systemContext: 'System',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '[Canvas context — the following file content is now available]\n\n## Facade (image)\n[Image attached]',
            },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,ctximg' },
            },
          ],
        },
        { role: 'assistant', content: 'Ready.' },
        { role: 'user', content: 'Describe the shapes and text.' },
      ],
    });

    expect(messages).toHaveLength(3);
    expect(messages[2].images).toEqual(['ctximg']);
    expect(messages[2].content).toContain('Current user request:\n\nDescribe the shapes and text.');
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
    expect(body.messages.at(-1)).not.toHaveProperty('images');
  });

  it('diagnostic: sends stripped base64 images in the Ollama request body', async () => {
    const diagnosticPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4:12b',
        message: { content: 'A red pixel.' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await completeOllamaChat({
      provider: 'ollama',
      connectorId: 'ollama-gemma-12b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the shapes and text in this image.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${diagnosticPngBase64}`,
              },
            },
          ],
        },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = body.messages.at(-1);
    expect(userMessage.images).toEqual([diagnosticPngBase64]);
    expect(userMessage.content).toContain('Describe the shapes and text');
    expect(userMessage.images[0]).not.toMatch(/^data:image\//);
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

  it('streams Ollama pull progress and returns on success', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"status":"pulling manifest"}\n'));
        controller.enqueue(encoder.encode('{"status":"downloading","completed":5,"total":10}\n'));
        controller.enqueue(encoder.encode('{"status":"success","model":"gemma4:26b"}\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      }),
    );

    const progress = [];
    const result = await pullOllamaModel({
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:26b',
      onProgress: (event) => progress.push(event),
    });

    expect(result.model).toBe('gemma4:26b');
    expect(progress).toEqual([
      { status: 'pulling manifest' },
      { status: 'downloading', completed: 5, total: 10 },
      { status: 'success', model: 'gemma4:26b' },
    ]);
  });

  it('throws when Ollama pull reports error status', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"status":"error","error":"pull denied"}\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      }),
    );

    await expect(
      pullOllamaModel({ model: 'gemma4:26b' }),
    ).rejects.toThrow('pull denied');
  });
});
