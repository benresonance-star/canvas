import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentApiError, getArtifact, resolveAgentChatTimeoutMs, saveAgentTemplate, sendAgentChat } from '../agentApi.js';

describe('agentApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves chat timeouts by provider', () => {
    expect(resolveAgentChatTimeoutMs('openai')).toBe(60_000);
    expect(resolveAgentChatTimeoutMs('ollama')).toBe(120_000);
  });

  it('maps network failure to AgentApiError', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      sendAgentChat({
        provider: 'openai',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('Canvas API'),
    });
  });

  it('prefixes 502 backend errors', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({
        error: 'Cannot reach OpenAI (ENOTFOUND). Check internet, VPN, or DNS for api.openai.com.',
      }),
    });

    await expect(
      sendAgentChat({
        provider: 'openai',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AgentApiError);
      expect(err.kind).toBe('backend');
      expect(err.message).toContain('Agent backend:');
      expect(err.message).toContain('Cannot reach OpenAI');
      return true;
    });
  });

  it('supports longer chat timeouts for local model calls', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'ok', model: 'gemma4:26b' }),
    });

    const result = await sendAgentChat({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
      messages: [{ role: 'user', content: 'hi' }],
      timeoutMs: 120_000,
    });

    expect(result.reply).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/agent/chat'),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps request aborts to timeout errors', async () => {
    const error = new DOMException('signal timed out', 'TimeoutError');
    vi.mocked(fetch).mockRejectedValue(error);

    await expect(
      sendAgentChat({
        provider: 'ollama',
        messages: [{ role: 'user', content: 'hi' }],
        timeoutMs: 120_000,
      }),
    ).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringContaining('120 seconds'),
    });
  });

  it('retries a create conflict as an update with the server revision', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({
          error: 'conflict',
          revision: 4,
          template: { id: 'brainstorming', revision: 4 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          template: { id: 'brainstorming', label: 'Brainstorming Agent', revision: 5 },
          revision: 5,
        }),
      });

    const result = await saveAgentTemplate({ id: 'brainstorming', label: 'Brainstorming Agent' }, 0);

    expect(result.template.revision).toBe(5);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/agent/templates/brainstorming'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          template: { id: 'brainstorming', label: 'Brainstorming Agent' },
          expectedRevision: 4,
        }),
      }),
    );
  });

  it('reads back the saved template when save response is missing template', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          template: { id: 'brainstorming', label: 'Brainstorming Agent', revision: 1 },
        }),
      });

    const result = await saveAgentTemplate({ id: 'brainstorming', label: 'Brainstorming Agent' }, 0);

    expect(result.template).toMatchObject({ id: 'brainstorming' });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/agent/templates/brainstorming'),
      expect.anything(),
    );
  });

  it('supports optional artifact payload lookups without hard 404 fetches', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ artifact: null }),
    });

    await expect(getArtifact('artifact/1', { optional: true })).resolves.toEqual({ artifact: null });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/artifacts/artifact%2F1?optional=1'),
      expect.anything(),
    );
  });
});
