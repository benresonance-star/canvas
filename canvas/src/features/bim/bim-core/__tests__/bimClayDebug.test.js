import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe('bimClayDebug', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.resetModules();
    delete globalThis.__canvasBimClayDebug;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete globalThis.__canvasBimClayDebug;
  });

  it('is disabled unless localStorage flag is set', async () => {
    const { isBimClayDebugEnabled } = await import('../bimClayDebug.js');
    expect(isBimClayDebugEnabled()).toBe(false);
    localStorageMock.setItem('BIM_CLAY_DEBUG', '1');
    expect(isBimClayDebugEnabled()).toBe(true);
  });

  it('publishes markers to window and subscribers', async () => {
    const {
      publishClayDebugMarker,
      getClayDebugMarker,
      subscribeClayDebug,
    } = await import('../bimClayDebug.js');
    const seen = [];
    const unsubscribe = subscribeClayDebug((marker) => seen.push(marker));

    publishClayDebugMarker({
      phase: 'applyClayBaseMaterials',
      ok: true,
      stats: { highlightedLocalIdCount: 12 },
    });

    expect(getClayDebugMarker()).toMatchObject({
      phase: 'applyClayBaseMaterials',
      ok: true,
      stats: { highlightedLocalIdCount: 12 },
    });
    expect(globalThis.__canvasBimClayDebug).toMatchObject({ ok: true });
    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it('setClayDebugEnabled toggles localStorage without reload', async () => {
    const { isBimClayDebugEnabled, setClayDebugEnabled } = await import('../bimClayDebug.js');
    expect(isBimClayDebugEnabled()).toBe(false);
    setClayDebugEnabled(true);
    expect(isBimClayDebugEnabled()).toBe(true);
    setClayDebugEnabled(false);
    expect(isBimClayDebugEnabled()).toBe(false);
  });

  it('logs to console only when debug is enabled', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { publishClayDebugMarker } = await import('../bimClayDebug.js');

    publishClayDebugMarker({ phase: 'test', ok: true });
    expect(debugSpy).not.toHaveBeenCalled();

    localStorageMock.setItem('BIM_CLAY_DEBUG', '1');
    vi.resetModules();
    const { publishClayDebugMarker: publishEnabled } = await import('../bimClayDebug.js');
    publishEnabled({ phase: 'test-enabled', ok: true });
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });
});
