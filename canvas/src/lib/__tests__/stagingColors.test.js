import { describe, expect, it } from 'vitest';
import { getStagingColorForType } from '../stagingColors.js';

describe('getStagingColorForType', () => {
  it('returns a stable color per known type', () => {
    expect(getStagingColorForType('image')).toBe('#3b82f6');
    expect(getStagingColorForType('pdf')).toBe('#ef4444');
    expect(getStagingColorForType('audio')).toBe('#22c55e');
  });

  it('falls back for unknown types', () => {
    expect(getStagingColorForType('unknown_type')).toBe('#64748b');
  });
});
