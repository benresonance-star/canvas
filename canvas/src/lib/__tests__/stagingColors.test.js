import { describe, expect, it } from 'vitest';
import { getMutedStagingStyleForType, getStagingColorForType } from '../stagingColors.js';

describe('getStagingColorForType', () => {
  it('returns a stable color per known type', () => {
    expect(getStagingColorForType('image')).toBe('#3b82f6');
    expect(getStagingColorForType('pdf')).toBe('#ef4444');
    expect(getStagingColorForType('audio')).toBe('#22c55e');
  });

  it('returns colors for canvas-only card types', () => {
    expect(getStagingColorForType('live')).toBe('#0ea5e9');
    expect(getStagingColorForType('agent')).toBe('#7c3aed');
    expect(getStagingColorForType('music-agent')).toBe('#db2777');
    expect(getStagingColorForType('sonic_studio')).toBe('#059669');
  });

  it('falls back for unknown types', () => {
    expect(getStagingColorForType('unknown_type')).toBe('#64748b');
  });
});

describe('getMutedStagingStyleForType', () => {
  it('derives muted border and background from the dock palette', () => {
    expect(getMutedStagingStyleForType('agent')).toEqual({
      borderColor: 'color-mix(in srgb, #7c3aed 21%, var(--color-border))',
      backgroundColor: 'color-mix(in srgb, #7c3aed 6%, var(--color-canvas))',
    });
  });
});
