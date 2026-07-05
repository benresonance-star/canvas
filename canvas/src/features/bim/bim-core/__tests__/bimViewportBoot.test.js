import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureFragmentsUpdated,
  hasViewportLayoutSize,
  isFragmentsModelRegistered,
} from '../bimViewportBoot.js';

describe('bim viewport boot helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats any non-trivial layout size as valid', () => {
    expect(hasViewportLayoutSize(2, 2)).toBe(true);
    expect(hasViewportLayoutSize(1, 1)).toBe(false);
    expect(hasViewportLayoutSize(800, 600)).toBe(true);
  });

  it('detects fragments model registration in the manager list', () => {
    const fragments = {
      models: {
        list: new Map([['model-a', {}]]),
      },
    };
    expect(isFragmentsModelRegistered(fragments, 'model-a')).toBe(true);
    expect(isFragmentsModelRegistered(fragments, 'model-b')).toBe(false);
  });

  it('retries fragments update until it succeeds', async () => {
    const updateFragments = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const syncedPromise = ensureFragmentsUpdated(updateFragments, {
      disposed: () => false,
      maxWaitMs: 1000,
    });

    await vi.runAllTimersAsync();
    const synced = await syncedPromise;

    expect(synced).toBe(true);
    expect(updateFragments).toHaveBeenCalledTimes(3);
  });
});
