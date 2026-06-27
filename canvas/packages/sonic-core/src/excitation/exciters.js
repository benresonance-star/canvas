import { BiquadFilter, OnePoleFilter } from '../dsp/filters.js';
import { SeededRandom } from '../dsp/SeededRandom.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';

export const EXCITER_TYPES = [
  'impulse',
  'noise_burst',
  'filtered_noise',
  'stick_transient',
  'brush_noise',
  'scrape_noise',
  'friction',
  'sine_ping',
  'sustained_bow',
];

export function renderExciter({
  type = 'stick_transient',
  sampleRate = 48000,
  durationSeconds = 1,
  seed = 1,
  velocity = 0.8,
  contact = {},
  material = {},
  gesture = {},
} = {}) {
  const frames = Math.max(1, Math.round(sampleRate * durationSeconds));
  const output = new Float32Array(frames);
  const random = new SeededRandom(seed);
  const safeVelocity = clamp(velocity, 0, 1.5);
  const hardness = clamp(contact.hardness ?? material.hardness ?? 0.5);
  const friction = clamp(contact.friction ?? material.roughness ?? 0.1);
  const durationMs = clamp(contact.contactDurationMs ?? gesture.durationMs ?? 10, 0.1, durationSeconds * 1000);
  const burstFrames = Math.max(1, Math.round(sampleRate * durationMs / 1000));

  if (type === 'impulse') {
    output[0] = safeVelocity;
    return output;
  }

  if (type === 'sine_ping') {
    const frequency = 80 + hardness * 900;
    for (let index = 0; index < frames; index += 1) {
      const envelope = Math.exp(-index / Math.max(1, burstFrames * 2));
      output[index] = sanitizeSample(Math.sin(2 * Math.PI * frequency * index / sampleRate) * envelope * safeVelocity);
    }
    return output;
  }

  const filter = type === 'filtered_noise' || type === 'brush_noise' || type === 'scrape_noise' || type === 'friction'
    ? new BiquadFilter({
      type: type === 'brush_noise' ? 'bandpass' : 'highpass',
      sampleRate,
      frequencyHz: 200 + hardness * 9000,
      q: 0.7 + friction * 5,
    })
    : new OnePoleFilter({ type: 'highpass', sampleRate, frequencyHz: 700 + hardness * 9000 });

  for (let index = 0; index < frames; index += 1) {
    const burstEnvelope = Math.exp(-index / Math.max(1, burstFrames));
    const sustainEnvelope = type === 'sustained_bow'
      ? Math.min(1, index / Math.max(1, burstFrames)) * Math.exp(-index / Math.max(1, frames * 1.5))
      : burstEnvelope;
    const scrapePulse = type === 'scrape_noise' || type === 'friction'
      ? 0.35 + 0.65 * Math.max(0, Math.sin(index * (0.01 + friction * 0.08)))
      : 1;
    let value = random.bipolar() * safeVelocity * sustainEnvelope * scrapePulse;
    value = filter.process(value);
    if (type === 'stick_transient') {
      value += index === 0 ? safeVelocity * (0.4 + hardness * 0.6) : 0;
    }
    output[index] = sanitizeSample(value);
  }

  return output;
}
