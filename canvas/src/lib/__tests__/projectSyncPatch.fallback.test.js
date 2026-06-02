import { describe, it, expect } from 'vitest';
import { shouldFallbackToPutAfterPatch } from '../sync/projectSyncPatch.js';

describe('shouldFallbackToPutAfterPatch', () => {
  it('returns false for null or success', () => {
    expect(shouldFallbackToPutAfterPatch(null)).toBe(false);
    expect(shouldFallbackToPutAfterPatch({ ok: true })).toBe(false);
  });

  it('returns true when patch kept local', () => {
    expect(
      shouldFallbackToPutAfterPatch({
        ok: false,
        conflict: true,
        patched: true,
        keptLocal: true,
      }),
    ).toBe(true);
  });

  it('returns false when user must resolve conflict', () => {
    expect(
      shouldFallbackToPutAfterPatch({
        ok: false,
        needsResolution: true,
        conflict: true,
      }),
    ).toBe(false);
  });

  it('returns false when server was adopted via patch', () => {
    expect(shouldFallbackToPutAfterPatch({ ok: true, pulled: true })).toBe(false);
  });
});
