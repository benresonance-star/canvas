import { describe, it, expect } from 'vitest';
import { formatFetchError } from '../openaiFetchErrors.js';

describe('formatFetchError', () => {
  it('maps ENOTFOUND to a clear message', () => {
    const err = new TypeError('fetch failed', {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
        hostname: 'api.openai.com',
      }),
    });
    const out = formatFetchError(err);
    expect(out.message).toContain('Cannot reach OpenAI');
    expect(out.message).toContain('ENOTFOUND');
  });

  it('maps timeout to a clear message', () => {
    const err = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    });
    const out = formatFetchError(err);
    expect(out.message).toContain('timed out');
  });

  it('maps generic fetch failed without proxy hint', () => {
    const err = new TypeError('fetch failed', { cause: new Error('connect') });
    const out = formatFetchError(err);
    expect(out.message).toContain('HTTPS_PROXY');
  });
});
