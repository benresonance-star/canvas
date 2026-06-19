import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentApiError, saveAgentTemplate, sendAgentChat } from '../agentApi.js';

describe('agentApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});
