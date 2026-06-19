import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/openaiFetch.js', () => ({
  fetchOpenAI: vi.fn(),
}));

import { fetchOpenAI } from '../../lib/openaiFetch.js';
import {
  completeChat,
  buildChatMessages,
  normalizeMessages,
  BASE_AGENT_SYSTEM,
} from '../openaiChat.js';

describe('buildChatMessages', () => {
  it('uses minimal system context without embedding file bodies in system', () => {
    const minimal =
      'You are a helpful assistant. File contents are in earlier user messages.';
    const messages = buildChatMessages({
      systemContext: minimal,
      messages: [
        { role: 'user', content: '[context] file body here' },
        { role: 'user', content: 'Question?' },
      ],
    });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(minimal);
    expect(messages[1].content).toContain('file body');
    expect(messages[0].content).not.toContain('file body');
  });

  it('falls back to BASE_AGENT_SYSTEM when systemContext empty', () => {
    const messages = buildChatMessages({
      systemContext: '',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(messages[0].content).toBe(BASE_AGENT_SYSTEM);
  });

  it('normalizeMessages preserves multimodal content arrays', () => {
    const parts = [
      { type: 'text', text: 'see image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ];
    const normalized = normalizeMessages([
      { role: 'user', content: parts },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(normalized[0].content).toEqual(parts);
    expect(buildChatMessages({ messages: normalized })[1].content).toEqual(parts);
  });
});

describe('completeChat', () => {
  beforeEach(() => {
    vi.mocked(fetchOpenAI).mockReset();
  });

  it('returns assistant reply on success', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'Hello from OpenAI' } }],
      }),
    });

    const result = await completeChat({
      apiKey: 'sk-test',
      provider: 'openai',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.reply).toBe('Hello from OpenAI');
    expect(fetchOpenAI).toHaveBeenCalledOnce();
  });

  it('strips provider prefix from template model before OpenAI request', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-5.5',
        choices: [{ message: { content: 'Hello from OpenAI' } }],
      }),
    });

    await completeChat({
      apiKey: 'sk-test',
      provider: 'openai',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const request = vi.mocked(fetchOpenAI).mock.calls[0][1];
    expect(JSON.parse(request.body).model).toBe('gpt-5.5');
  });

  it('throws OpenAI API error message on 401', async () => {
    vi.mocked(fetchOpenAI).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Incorrect API key provided', type: 'invalid_request_error' },
      }),
    });

    await expect(
      completeChat({
        apiKey: 'sk-bad',
        provider: 'openai',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow('Incorrect API key provided');
  });

  it('rethrows friendly fetch errors from fetchOpenAI', async () => {
    vi.mocked(fetchOpenAI).mockRejectedValue(
      new Error('Cannot reach OpenAI (ENOTFOUND). Check internet, VPN, or DNS for api.openai.com.'),
    );

    await expect(
      completeChat({
        apiKey: 'sk-test',
        provider: 'openai',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow('Cannot reach OpenAI');
  });
});
