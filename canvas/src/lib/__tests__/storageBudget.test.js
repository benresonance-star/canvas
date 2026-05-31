import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evictInactiveProjectCaches,
  clearLocalProjectCaches,
  isQuotaError,
} from '../storageBudget.js';

describe('storageBudget', () => {
  const storage = new Map();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
      key: (i) => [...storage.keys()][i] ?? null,
      get length() {
        return storage.size;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isQuotaError detects quota exceptions', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError(new Error('quota exceeded'))).toBe(true);
  });

  it('evictInactiveProjectCaches skips active project', () => {
    storage.set('canvas:project:active', 'a');
    storage.set('canvas:project:other', 'b');
    const evicted = evictInactiveProjectCaches('active', ['active']);
    expect(evicted).toContain('other');
    expect(evicted).not.toContain('active');
    expect(storage.has('canvas:project:active')).toBe(true);
    expect(storage.has('canvas:project:other')).toBe(false);
  });

  it('clearLocalProjectCaches can keep active project', () => {
    storage.set('canvas:project:keep', 'x');
    storage.set('canvas:project:drop', 'y');
    clearLocalProjectCaches({ activeProjectId: 'keep', keepActive: true });
    expect(storage.has('canvas:project:keep')).toBe(true);
    expect(storage.has('canvas:project:drop')).toBe(false);
  });
});
