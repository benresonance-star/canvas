import { describe, expect, it } from 'vitest';
import {
  formatPitchDisplay,
  getPitchSliderConfig,
  normalizePitchValue,
} from '../sonicVoiceParams.js';
import { deriveVoiceRootHz, resolveVoiceRootHz } from '../../../../../packages/sonic-core/src/render/renderSonicEvent.js';
import { createSonicVoiceState } from '../../../../../packages/sonic-core/src/types/models.js';

describe('sonic voice pitch', () => {
  it('applies semitone pitch offset on output', () => {
    const voice = createSonicVoiceState({ archetype: 'kick' });
    const baseHz = resolveVoiceRootHz(voice);
    const upOctaveHz = resolveVoiceRootHz({
      ...voice,
      output: { ...voice.output, pitchSemitones: 12 },
    });
    expect(upOctaveHz).toBeCloseTo(baseHz * 2, 1);
    expect(deriveVoiceRootHz(voice)).toBeCloseTo(baseHz, 1);
  });

  it('defaults pitch to zero semitones', () => {
    const voice = createSonicVoiceState({ archetype: 'snare' });
    expect(voice.output.pitchSemitones).toBe(0);
    expect(resolveVoiceRootHz(voice)).toBeCloseTo(deriveVoiceRootHz(voice), 1);
  });

  it('snaps pitch to semitone steps when semitone mode is enabled', () => {
    expect(getPitchSliderConfig(true)).toEqual({ min: -24, max: 24, step: 1 });
    expect(getPitchSliderConfig(false)).toEqual({ min: -24, max: 24, step: 0.01 });
    expect(normalizePitchValue(3.6, true)).toBe(4);
    expect(normalizePitchValue(3.6, false)).toBe(3.6);
    expect(formatPitchDisplay(3, true)).toBe('+3 st');
    expect(formatPitchDisplay(3.25, false)).toBe('+3.25 st');
  });
});
