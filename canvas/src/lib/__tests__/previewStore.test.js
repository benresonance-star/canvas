import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  previewCacheKey,
  resetPreviewDbConnection,
} from '../previewStore.js';

describe('previewStore', () => {
  beforeEach(() => {
    resetPreviewDbConnection();
  });

  it('previewCacheKey formats project card version', () => {
    expect(previewCacheKey('p1', 'card-a', 2)).toBe('p1:card-a:v2');
  });

  it('resetPreviewDbConnection clears singleton without throwing', () => {
    resetPreviewDbConnection();
    resetPreviewDbConnection();
    expect(true).toBe(true);
  });
});

describe('previewStore getDb singleton', () => {
  beforeEach(() => {
    resetPreviewDbConnection();
    vi.restoreAllMocks();
  });

  it('reuses one indexedDB.open across sequential getPreview calls', async () => {
    const open = vi.fn(() => {
      const makeGetReq = () => {
        const getReq = { onsuccess: null, onerror: null, result: null };
        queueMicrotask(() => getReq.onsuccess?.({ target: getReq }));
        return getReq;
      };
      const store = {
        get: vi.fn(() => makeGetReq()),
        put: vi.fn(),
        delete: vi.fn(),
      };
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: vi.fn(),
          transaction: () => ({
            objectStore: () => store,
            oncomplete: null,
            onerror: null,
          }),
          close: vi.fn(),
          onversionchange: null,
        },
      };
      queueMicrotask(() => req.onsuccess?.({ target: req }));
      return req;
    });
    vi.stubGlobal('indexedDB', { open });
    vi.resetModules();

    const { getPreview } = await import('../previewStore.js');
    await getPreview('p:c:v1', { localOnly: true });
    await getPreview('p:c:v2', { localOnly: true });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
