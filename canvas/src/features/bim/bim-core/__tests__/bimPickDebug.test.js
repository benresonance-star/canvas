import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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
  };
}

describe('bimPickDebug', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is disabled unless localStorage flag is set', async () => {
    const { isBimPickDebugEnabled } = await import('../bimPickDebug.js');
    expect(isBimPickDebugEnabled()).toBe(false);
    localStorageMock.setItem('BIM_PICK_DEBUG', '1');
    expect(isBimPickDebugEnabled()).toBe(true);
  });

  it('logs warnings only when debug is enabled', async () => {
    const { logBimPickWarning } = await import('../bimPickDebug.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logBimPickWarning('GUID not in prepared element index', { ifcGlobalId: 'missing' });
    expect(warnSpy).not.toHaveBeenCalled();

    localStorageMock.setItem('BIM_PICK_DEBUG', '1');
    logBimPickWarning('GUID not in prepared element index', { ifcGlobalId: 'missing' });
    expect(warnSpy).toHaveBeenCalledWith('[bim-pick]', 'GUID not in prepared element index', { ifcGlobalId: 'missing' });
  });
});
