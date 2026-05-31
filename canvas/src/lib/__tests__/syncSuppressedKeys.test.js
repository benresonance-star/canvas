import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readSuppressedSyncKeys,
  readSuppressedSyncKeysFromDocument,
  addSuppressedSyncKey,
  suppressedKeysForSave,
} from '../syncSuppressedKeys.js';

const storage = new Map();

describe('syncSuppressedKeys', () => {
  const projectId = 'proj-1';

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      removeItem: (key) => storage.delete(key),
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges document and local keys', () => {
    localStorage.setItem(
      'canvas:suppressed-sync-keys:proj-1',
      JSON.stringify(['local-key']),
    );
    const merged = readSuppressedSyncKeys(projectId, {
      suppressedSyncKeys: ['doc-key'],
    });
    expect([...merged].sort()).toEqual(['doc-key', 'local-key']);
  });

  it('readSuppressedSyncKeysFromDocument returns only document keys', () => {
    const set = readSuppressedSyncKeysFromDocument({
      suppressedSyncKeys: ['a', 'b'],
    });
    expect([...set]).toEqual(['a', 'b']);
  });

  it('addSuppressedSyncKey persists to localStorage', () => {
    addSuppressedSyncKey(projectId, 'k1');
    expect(readSuppressedSyncKeys(projectId).has('k1')).toBe(true);
  });

  it('suppressedKeysForSave returns sorted unique keys', () => {
    addSuppressedSyncKey(projectId, 'z');
    const keys = suppressedKeysForSave(projectId, {
      suppressedSyncKeys: ['a', 'z'],
    });
    expect(keys).toEqual(['a', 'z']);
  });
});
