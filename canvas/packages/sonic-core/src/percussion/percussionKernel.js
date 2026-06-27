import { createAudioBlock, analyzeAudioBlock } from '../audio/AudioBlock.js';
import { SafetyLimiter } from '../dsp/SafetyLimiter.js';
import { SeededRandom } from '../dsp/SeededRandom.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';
import { renderSonicEvent } from '../render/renderSonicEvent.js';
import { createDefaultPercussionKit, createPercussionPreset } from './percussionPresets.js';

export function renderPercussionEvent({
  voice,
  archetype = 'kick',
  event = {},
  sampleRate = 48000,
  durationSeconds = 1,
  seed = 1,
  microVariation = true,
} = {}) {
  const random = new SeededRandom(event.randomSeed ?? seed);
  const variedEvent = microVariation
    ? applyPercussionMicroVariation(event, random)
    : event;
  return renderSonicEvent({
    voice: voice ?? createPercussionPreset(archetype),
    event: variedEvent,
    sampleRate,
    durationSeconds,
    seed: event.randomSeed ?? seed,
  });
}

export function applyPercussionMicroVariation(event = {}, random = new SeededRandom(1)) {
  const amount = clamp(event.variationAmount ?? 0.035, 0, 0.2);
  return {
    ...event,
    velocity: clamp((event.velocity ?? 0.8) + random.bipolar() * amount, 0, 1.5),
    pitchHz: event.pitchHz ? event.pitchHz * (1 + random.bipolar() * amount) : undefined,
    gestureOverride: {
      ...(event.gestureOverride ?? {}),
      velocity: clamp((event.gestureOverride?.velocity ?? event.velocity ?? 0.8) + random.bipolar() * amount, 0, 1.5),
    },
    contactOverride: {
      ...(event.contactOverride ?? {}),
      hardness: event.contactOverride?.hardness === undefined
        ? undefined
        : clamp(event.contactOverride.hardness + random.bipolar() * amount),
    },
  };
}

export function renderPercussionBeat({
  kit = createDefaultPercussionKit(),
  events = [],
  tempoBpm = 120,
  bars = 1,
  sampleRate = 48000,
  seed = 1,
} = {}) {
  const secondsPerBeat = 60 / clamp(tempoBpm, 30, 300);
  const durationSeconds = Math.max(secondsPerBeat * 4 * bars, 0.25);
  const totalFrames = Math.ceil(durationSeconds * sampleRate);
  const output = createAudioBlock({ channels: 2, frames: totalFrames });
  const limiter = new SafetyLimiter({ sampleRate });
  for (const event of events) {
    const voice = kit[event.voiceId] ?? kit[event.archetype] ?? createPercussionPreset(event.archetype ?? 'kick');
    const startFrame = Math.max(0, Math.round((event.timeBeats ?? 0) * secondsPerBeat * sampleRate));
    const render = renderPercussionEvent({
      voice,
      archetype: event.archetype,
      event,
      sampleRate,
      durationSeconds: event.durationSeconds ?? 1,
      seed: event.randomSeed ?? seed + startFrame,
      microVariation: event.microVariation !== false,
    }).buffer;
    for (let channel = 0; channel < 2; channel += 1) {
      const source = render[channel] ?? render[0];
      for (let index = 0; index < source.length && startFrame + index < totalFrames; index += 1) {
        output[channel][startFrame + index] = sanitizeSample(output[channel][startFrame + index] + source[index]);
      }
    }
  }
  limiter.processBlock(output);
  return {
    sampleRate,
    durationSeconds,
    buffer: output,
    stats: analyzeAudioBlock(output),
  };
}
