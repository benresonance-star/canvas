import { BiquadFilter } from '../dsp/filters.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';
import { interpolateModalRatios } from '../materials/materialModalRatios.js';

export function createModalModes({
  rootHz = 120,
  modeCount = 6,
  material = {},
  body = {},
  position = {},
} = {}) {
  const count = Math.max(1, Math.floor(modeCount));
  const ratios = interpolateModalRatios({
    materialType: material.type,
    inharmonicity: material.inharmonicity ?? 0.3,
    count,
  });
  const edgeBrightness = clamp(position.radius ?? 0.2);
  const damping = clamp((material.damping ?? 0.35) * 0.6 + (body.damping ?? 0.35) * 0.4);
  const resonance = clamp(body.resonance ?? 0.6);
  return ratios.map((ratio, index) => {
    const highModeLift = 1 + edgeBrightness * index * 0.05;
    return {
      frequencyHz: rootHz * ratio * highModeLift,
      gain: (1 / (1 + index * 0.42)) * (0.7 + resonance * 0.6),
      decaySeconds: clamp(0.08 + resonance * 1.2 - damping * 0.8, 0.03, 3) / (1 + index * 0.14),
      q: clamp(4 + resonance * 20 - damping * 8, 0.5, 60),
      pan: clamp((index % 2 === 0 ? -1 : 1) * edgeBrightness * 0.35, -1, 1),
    };
  });
}

export function renderModalResonator(input, {
  sampleRate = 48000,
  modes,
  inputGain = 1,
  outputGain = 1,
} = {}) {
  const safeModes = modes?.length ? modes : createModalModes();
  const filters = safeModes.map((mode) => ({
    mode,
    filter: new BiquadFilter({
      type: 'bandpass',
      sampleRate,
      frequencyHz: mode.frequencyHz,
      q: mode.q,
    }),
  }));
  const left = new Float32Array(input.length);
  const right = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    let l = 0;
    let r = 0;
    for (const { mode, filter } of filters) {
      const decay = Math.exp(-index / Math.max(1, mode.decaySeconds * sampleRate));
      const value = filter.process(input[index] * inputGain) * mode.gain * decay * outputGain;
      const pan = clamp(mode.pan ?? 0, -1, 1);
      l += value * (pan <= 0 ? 1 : 1 - pan);
      r += value * (pan >= 0 ? 1 : 1 + pan);
    }
    left[index] = sanitizeSample(l);
    right[index] = sanitizeSample(r);
  }
  return [left, right];
}
