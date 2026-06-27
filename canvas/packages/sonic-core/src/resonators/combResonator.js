import { FractionalDelayLine } from '../dsp/FractionalDelayLine.js';
import { OnePoleFilter } from '../dsp/filters.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';

export function renderCombResonator(input, {
  sampleRate = 48000,
  frequencyHz = 120,
  feedback = 0.72,
  damping = 0.35,
  brightness = 0.5,
  outputGain = 0.8,
} = {}) {
  const delaySamples = sampleRate / clamp(frequencyHz, 20, sampleRate * 0.45);
  const delay = new FractionalDelayLine(Math.ceil(delaySamples + 4));
  const damper = new OnePoleFilter({
    type: 'lowpass',
    sampleRate,
    frequencyHz: 800 + clamp(brightness) * 14000,
  });
  const safeFeedback = clamp(feedback, -0.96, 0.96) * (1 - clamp(damping) * 0.35);
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const delayed = damper.process(delay.read(delaySamples));
    const value = sanitizeSample(input[index] + delayed * safeFeedback);
    delay.write(value);
    output[index] = sanitizeSample(delayed * outputGain + input[index] * 0.2);
  }
  return [output, output.slice()];
}

export function renderKarplusStrong({
  sampleRate = 48000,
  durationSeconds = 1,
  frequencyHz = 110,
  seed = 1,
  damping = 0.35,
  brightness = 0.5,
} = {}) {
  const frames = Math.max(1, Math.round(sampleRate * durationSeconds));
  const input = new Float32Array(frames);
  let state = Number(seed) >>> 0 || 1;
  const burstFrames = Math.max(2, Math.round(sampleRate / clamp(frequencyHz, 20, sampleRate * 0.45)));
  for (let index = 0; index < burstFrames && index < frames; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    input[index] = (state / 0xffffffff) * 2 - 1;
  }
  return renderCombResonator(input, {
    sampleRate,
    frequencyHz,
    feedback: 0.92 - clamp(damping) * 0.3,
    damping,
    brightness,
    outputGain: 0.9,
  });
}
