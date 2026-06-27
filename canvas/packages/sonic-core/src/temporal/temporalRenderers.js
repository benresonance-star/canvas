import { analyzeAudioBlock, createAudioBlock } from '../audio/AudioBlock.js';
import { AllPassFilter } from '../dsp/AllPassFilter.js';
import { FractionalDelayLine } from '../dsp/FractionalDelayLine.js';
import { OnePoleFilter } from '../dsp/filters.js';
import { SafetyLimiter } from '../dsp/SafetyLimiter.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';
import { renderCombResonator } from '../resonators/combResonator.js';
import { createTemporalState } from './temporalState.js';

export function renderDelay(buffer, {
  sampleRate = 48000,
  delayMs = 240,
  feedback = 0.28,
  wet = 0.18,
  damping = 0.3,
  mode = 'stereo',
} = {}) {
  const output = cloneBuffer(buffer);
  const delaySamples = sampleRate * clamp(delayMs, 1, 4000) / 1000;
  const delays = [new FractionalDelayLine(Math.ceil(delaySamples + 4)), new FractionalDelayLine(Math.ceil(delaySamples * 1.17 + 4))];
  const dampers = [0, 1].map(() => new OnePoleFilter({ type: 'lowpass', sampleRate, frequencyHz: 1200 + (1 - damping) * 12000 }));
  const safeFeedback = clamp(feedback, 0, 0.92);
  const safeWet = clamp(wet);
  for (let index = 0; index < output[0].length; index += 1) {
    for (let channel = 0; channel < output.length; channel += 1) {
      const source = buffer[channel]?.[index] ?? buffer[0][index] ?? 0;
      const readChannel = mode === 'ping-pong' ? 1 - channel : channel;
      const delayed = dampers[channel].process(delays[readChannel].read(readChannel === 0 ? delaySamples : delaySamples * 1.17));
      delays[channel].write(source + delayed * safeFeedback);
      output[channel][index] = sanitizeSample(source * (1 - safeWet) + delayed * safeWet);
    }
  }
  return limitBuffer(output, sampleRate);
}

export function renderFDNReverb(buffer, {
  sampleRate = 48000,
  size = 0.45,
  feedback = 0.62,
  wet = 0.22,
  damping = 0.35,
} = {}) {
  const output = cloneBuffer(buffer);
  const delayMs = [29.7, 37.1, 41.1, 53.3, 61.7, 71.9, 83.9, 97.3].map((value) => value * (0.65 + clamp(size) * 1.6));
  const lines = delayMs.map((ms) => new FractionalDelayLine(Math.ceil(sampleRate * ms / 1000) + 4));
  const filters = delayMs.map(() => new OnePoleFilter({ type: 'lowpass', sampleRate, frequencyHz: 1600 + (1 - damping) * 10000 }));
  const state = new Float32Array(lines.length);
  const safeFeedback = clamp(feedback, 0, 0.96);
  const safeWet = clamp(wet);
  for (let index = 0; index < output[0].length; index += 1) {
    const input = ((buffer[0]?.[index] ?? 0) + (buffer[1]?.[index] ?? buffer[0]?.[index] ?? 0)) * 0.5;
    let sum = 0;
    for (let line = 0; line < lines.length; line += 1) {
      state[line] = filters[line].process(lines[line].read(sampleRate * delayMs[line] / 1000));
      sum += state[line];
    }
    const mixed = householderMix(state, sum);
    for (let line = 0; line < lines.length; line += 1) {
      lines[line].write(input * 0.18 + mixed[line] * safeFeedback);
    }
    const leftWet = (state[0] + state[2] + state[4] + state[6]) * 0.25;
    const rightWet = (state[1] + state[3] + state[5] + state[7]) * 0.25;
    output[0][index] = sanitizeSample((buffer[0]?.[index] ?? 0) * (1 - safeWet) + leftWet * safeWet);
    output[1][index] = sanitizeSample((buffer[1]?.[index] ?? buffer[0]?.[index] ?? 0) * (1 - safeWet) + rightWet * safeWet);
  }
  return limitBuffer(output, sampleRate);
}

export function renderShimmer(buffer, {
  sampleRate = 48000,
  pitchRatio = 2,
  feedback = 0.48,
  wet = 0.18,
  damping = 0.28,
} = {}) {
  const preDiffused = renderFDNReverb(buffer, { sampleRate, feedback: clamp(feedback, 0, 0.86), wet: 1, damping, size: 0.35 });
  const shifted = createAudioBlock({ channels: 2, frames: preDiffused[0].length });
  const ratio = clamp(pitchRatio, 0.25, 4);
  for (let channel = 0; channel < 2; channel += 1) {
    for (let index = 0; index < shifted[channel].length; index += 1) {
      const sourceIndex = index * ratio;
      const i0 = Math.floor(sourceIndex) % preDiffused[channel].length;
      const i1 = (i0 + 1) % preDiffused[channel].length;
      const frac = sourceIndex - Math.floor(sourceIndex);
      shifted[channel][index] = sanitizeSample(preDiffused[channel][i0] * (1 - frac) + preDiffused[channel][i1] * frac);
    }
  }
  const safeWet = clamp(wet);
  const output = cloneBuffer(buffer);
  for (let channel = 0; channel < 2; channel += 1) {
    for (let index = 0; index < output[channel].length; index += 1) {
      output[channel][index] = sanitizeSample((buffer[channel]?.[index] ?? 0) * (1 - safeWet) + shifted[channel][index] * safeWet);
    }
  }
  return limitBuffer(output, sampleRate);
}

export function renderFreeze(buffer, {
  sampleRate = 48000,
  wet = 0.35,
  feedback = 0.995,
} = {}) {
  const output = cloneBuffer(buffer);
  const safeWet = clamp(wet);
  const safeFeedback = clamp(feedback, 0.9, 0.999);
  for (let channel = 0; channel < output.length; channel += 1) {
    let held = 0;
    for (let index = 0; index < output[channel].length; index += 1) {
      const source = buffer[channel]?.[index] ?? 0;
      if (Math.abs(source) > Math.abs(held) * 0.85) held = source;
      held = sanitizeSample(held * safeFeedback + source * (1 - safeFeedback));
      output[channel][index] = sanitizeSample(source * (1 - safeWet) + held * safeWet);
    }
  }
  return limitBuffer(output, sampleRate);
}

export function renderParallelResonator(buffer, {
  sampleRate = 48000,
  amount = 0.18,
  frequencyHz = 220,
} = {}) {
  const mono = new Float32Array(buffer[0].length);
  for (let index = 0; index < mono.length; index += 1) mono[index] = ((buffer[0]?.[index] ?? 0) + (buffer[1]?.[index] ?? 0)) * 0.5;
  const resonated = renderCombResonator(mono, { sampleRate, frequencyHz, feedback: 0.72, damping: 0.4, brightness: 0.5 });
  const output = cloneBuffer(buffer);
  const safeAmount = clamp(amount);
  for (let channel = 0; channel < 2; channel += 1) {
    for (let index = 0; index < output[channel].length; index += 1) {
      output[channel][index] = sanitizeSample((buffer[channel]?.[index] ?? 0) * (1 - safeAmount) + resonated[channel][index] * safeAmount);
    }
  }
  return limitBuffer(output, sampleRate);
}

export function renderTemporalChain(buffer, temporalState = {}, { sampleRate = 48000 } = {}) {
  const state = createTemporalState(temporalState);
  if (!state.enabled) return cloneBuffer(buffer);
  let output = cloneBuffer(buffer);
  if (state.delay.enabled) output = renderDelay(output, { sampleRate, ...state.delay });
  if (state.fdnReverb.enabled) output = renderFDNReverb(output, { sampleRate, ...state.fdnReverb });
  if (state.shimmer.enabled) output = renderShimmer(output, { sampleRate, ...state.shimmer });
  if (state.freeze.enabled) output = renderFreeze(output, { sampleRate, ...state.freeze });
  if (state.resonator.enabled) output = renderParallelResonator(output, { sampleRate, ...state.resonator });
  return limitBuffer(output, sampleRate);
}

export function analyzeTemporalRender(buffer) {
  return analyzeAudioBlock(buffer);
}

function cloneBuffer(buffer) {
  const channels = Math.max(1, buffer?.length ?? 1);
  const frames = Math.max(1, buffer?.[0]?.length ?? 1);
  const output = createAudioBlock({ channels, frames });
  for (let channel = 0; channel < channels; channel += 1) {
    output[channel].set(buffer[channel] ?? buffer[0] ?? new Float32Array(frames));
  }
  return output;
}

function limitBuffer(buffer, sampleRate) {
  const limiter = new SafetyLimiter({ sampleRate });
  return limiter.processBlock(buffer);
}

function householderMix(values, sum) {
  const output = new Float32Array(values.length);
  const scale = 2 / values.length;
  for (let index = 0; index < values.length; index += 1) {
    output[index] = sanitizeSample(values[index] - scale * sum);
  }
  return output;
}
