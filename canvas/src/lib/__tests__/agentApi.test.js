import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentApiError, sendAgentChat } from '../agentApi.js';

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
});
