import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_API_REQUEST_TIMEOUT_MS } from '../bootSync.js';

describe('canvasProjectsApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('keeps index reads within the boot API request budget', async () => {
    const signal = { aborted: false };
    const timeout = vi.fn(() => signal);
    vi.stubGlobal('AbortSignal', { timeout });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ index: { projects: [] }, updatedAt: null, revision: 0 }),
    })));

    const { fetchCanvasIndexDocument } = await import('../canvasProjectsApi.js');
    await fetchCanvasIndexDocument();

    expect(timeout).toHaveBeenCalledWith(BOOT_API_REQUEST_TIMEOUT_MS);
  });

  it('uses an extended timeout for workspace index writes', async () => {
    const signal = { aborted: false };
    const timeout = vi.fn(() => signal);
    vi.stubGlobal('AbortSignal', { timeout });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ revision: 2, updatedAt: 'now' }),
    })));

    const { saveCanvasIndex } = await import('../canvasProjectsApi.js');
    await saveCanvasIndex({ projects: [] }, 1, 'client-1');

    expect(timeout).toHaveBeenCalledWith(180_000);
  });
});
