import { describe, expect, it } from 'vitest';
import { createDefaultBeatPattern } from '../../../../../../../../packages/music-core/src/index.js';
import {
  applyPocket,
  buildPatternEvents,
  buildPocketSchedule,
  createDefaultPocketState,
  msToBeats,
  seededUnitValue,
} from '../PocketEngine.js';

describe('PocketEngine', () => {
  it('preserves event identity, timing, and velocity when disabled', () => {
    const pattern = createDefaultBeatPattern();
    const events = buildPatternEvents(pattern, { tempoBpm: 120 });
    const pocketed = applyPocket(events, createDefaultPocketState({ enabled: false }), {
      tempoBpm: 120,
      stepsPerBar: 16,
      loopBeats: 4,
    });

    expect(pocketed).toHaveLength(events.length);
    for (let index = 0; index < events.length; index += 1) {
      expect(pocketed[index].id).toBe(events[index].id);
      expect(pocketed[index].pocketTimeBeats).toBeCloseTo(events[index].baseTimeBeats);
      expect(pocketed[index].finalVelocity).toBe(events[index].velocity);
    }
  });

  it('creates audible profile ranges for deep pocket', () => {
    const pattern = createDefaultBeatPattern();
    const schedule = buildPocketSchedule(
      pattern,
      createDefaultPocketState({ enabled: true, profileId: 'deep-pocket', amount: 1, swing: 0 }),
      { tempoBpm: 120, sampleRate: 48000 },
    );
    const snare = schedule.events.find((event) => event.role === 'snare');
    const hat = schedule.events.find((event) => event.role === 'hat' && event.sourceStep > 0);

    expect(snare.offsetMs).toBeGreaterThan(18);
    expect(hat.offsetMs).toBeLessThan(-3);
  });

  it('keeps probability deterministic by seed', () => {
    const pattern = createDefaultBeatPattern();
    const hat = pattern.tracks.find((track) => track.role === 'hat');
    for (const step of hat.steps) step.probability = 0.5;
    const state = createDefaultPocketState({ enabled: true, seed: 42 });
    const first = buildPocketSchedule(pattern, state, { tempoBpm: 100, sampleRate: 44100 });
    const second = buildPocketSchedule(pattern, state, { tempoBpm: 100, sampleRate: 44100 });

    expect(first.events.map((event) => event.probabilityPass)).toEqual(
      second.events.map((event) => event.probabilityPass),
    );
  });

  it('separates swing from role timing', () => {
    const pattern = createDefaultBeatPattern();
    const hat = pattern.tracks.find((track) => track.role === 'hat');
    hat.steps[1].active = true;
    const noSwing = buildPocketSchedule(
      pattern,
      createDefaultPocketState({ enabled: true, profileId: 'tight', swing: 0, amount: 1 }),
      { tempoBpm: 120, sampleRate: 48000 },
    );
    const swing = buildPocketSchedule(
      pattern,
      createDefaultPocketState({ enabled: true, profileId: 'tight', swing: 1, amount: 1 }),
      { tempoBpm: 120, sampleRate: 48000 },
    );
    const noSwingHat = noSwing.events.find((event) => event.trackId === 'hat-closed' && event.sourceStep === 1);
    const swingHat = swing.events.find((event) => event.trackId === 'hat-closed' && event.sourceStep === 1);

    expect(swingHat.timeFrames).toBeGreaterThan(noSwingHat.timeFrames);
  });

  it('uses stable seeded unit values and beat conversions', () => {
    expect(seededUnitValue('kick:0', 7)).toBe(seededUnitValue('kick:0', 7));
    expect(msToBeats(250, 120)).toBeCloseTo(0.5);
  });
});
