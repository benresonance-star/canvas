import { describe, expect, it } from 'vitest';
import { createDefaultBeatPattern } from '../../../../../../../../packages/music-core/src/index.js';
import { createDefaultPocketState } from '../../pocket/index.js';
import {
  applyGlitch,
  buildGlitchSchedule,
  createDefaultGlitchState,
  normalizeGlitchState,
} from '../GlitchEngine.js';

describe('GlitchEngine', () => {
  it('normalizes disabled glitch state with bounded controls', () => {
    const state = normalizeGlitchState({
      enabled: true,
      amount: 2,
      density: -1,
      phraseLengthLoops: 99,
      seed: '12',
    });

    expect(state.enabled).toBe(true);
    expect(state.amount).toBe(1);
    expect(state.density).toBe(0);
    expect(state.phraseLengthLoops).toBe(8);
    expect(state.seed).toBe(12);
  });

  it('passes pocket events through when disabled', () => {
    const events = [
      {
        id: 'kick:0',
        trackId: 'kick',
        role: 'kick',
        sourceStep: 0,
        pocketTimeBeats: 0,
        finalVelocity: 0.9,
      },
    ];
    const glitched = applyGlitch(events, createDefaultGlitchState({ enabled: false }), {
      loopBeats: 4,
    });

    expect(glitched).toHaveLength(1);
    expect(glitched[0]).toEqual(expect.objectContaining({
      sourceEventId: 'kick:0',
      scheduledBeat: 0,
      operation: 'base',
      velocity: 0.9,
    }));
  });

  it('creates deterministic phrase-block mutations with protected downbeat', () => {
    const pattern = createDefaultBeatPattern();
    const glitch = createDefaultGlitchState({
      enabled: true,
      profileId: 'idm',
      amount: 1,
      density: 1,
      phraseLengthLoops: 4,
      resetStrength: 0,
      seed: 777,
      operations: {
        stutter: 1,
        ratchet: 0,
        dropout: 0,
        repeat: 0,
        pitch: 0,
        gate: 0,
      },
      roleRules: {
        kick: { probability: 1, protectPrimary: true, maxRepeats: 4 },
        hat: { probability: 1, protectPrimary: false, maxRepeats: 4 },
      },
    });
    const first = buildGlitchSchedule(
      pattern,
      createDefaultPocketState({ enabled: false }),
      glitch,
      { tempoBpm: 120, sampleRate: 48000 },
    );
    const second = buildGlitchSchedule(
      pattern,
      createDefaultPocketState({ enabled: false }),
      glitch,
      { tempoBpm: 120, sampleRate: 48000 },
    );

    expect(first.events).toEqual(second.events);
    expect(first.glitchEnabled).toBe(true);
    expect(first.phraseLengthLoops).toBe(4);
    expect(first.phraseFrames).toBe(first.loopFrames * 4);
    expect(first.events.some((event) => event.operation === 'stutter')).toBe(true);
    expect(first.events.filter((event) => event.trackId === 'kick' && event.sourceStep === 0)).toHaveLength(4);
  });

  it('carries Phase 2 sonic metadata into mutated schedule events', () => {
    const pattern = createDefaultBeatPattern();
    const glitch = createDefaultGlitchState({
      enabled: true,
      amount: 1,
      density: 1,
      phraseLengthLoops: 2,
      resetStrength: 0,
      seed: 42,
      operations: {
        stutter: 0,
        ratchet: 0,
        dropout: 0,
        repeat: 0,
        pitch: 1,
        gate: 0,
      },
      roleRules: {
        hat: { probability: 1, protectPrimary: false, pitchRange: 9 },
      },
      sonic: {
        enabled: true,
        intensity: 1,
        temporalSend: 0.6,
        toneOffset: 0.35,
        distortionAmount: 0.5,
      },
    });
    const schedule = buildGlitchSchedule(
      pattern,
      createDefaultPocketState({ enabled: false }),
      glitch,
      { tempoBpm: 120, sampleRate: 48000 },
    );
    const pitchEvent = schedule.events.find((event) => event.operation === 'pitch');

    expect(pitchEvent).toEqual(expect.objectContaining({
      pitchOffsetSemitones: expect.any(Number),
      gain: expect.any(Number),
      toneOffset: expect.any(Number),
      temporalSend: expect.any(Number),
      distortionAmount: expect.any(Number),
      mutationId: expect.any(String),
      sourceEventId: expect.any(String),
    }));
    expect(pitchEvent.temporalSend).toBeGreaterThan(0);
    expect(pitchEvent.distortionAmount).toBeGreaterThan(0);
  });
});
