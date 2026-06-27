import { clamp, sanitizeSample } from './sanitizeSample.js';
import { SeededRandom } from './SeededRandom.js';

export function createWhiteNoise(seed) {
  const random = seed instanceof SeededRandom ? seed : new SeededRandom(seed);
  return () => random.bipolar();
}

export function createPinkNoise(seed) {
  const white = createWhiteNoise(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const input = white();
    b0 = 0.99765 * b0 + input * 0.0990460;
    b1 = 0.96300 * b1 + input * 0.2965164;
    b2 = 0.57000 * b2 + input * 1.0526913;
    return sanitizeSample((b0 + b1 + b2 + input * 0.1848) * 0.18);
  };
}

export function createBrownNoise(seed) {
  const white = createWhiteNoise(seed);
  let state = 0;
  return () => {
    state = clamp(state + white() * 0.06, -1, 1);
    return sanitizeSample(state);
  };
}

export function createSmoothedRandom({ seed, smoothing = 0.98 } = {}) {
  const white = createWhiteNoise(seed);
  const coefficient = clamp(smoothing, 0, 0.9999);
  let state = white();
  return () => {
    state = sanitizeSample(state * coefficient + white() * (1 - coefficient));
    return state;
  };
}

export function renderNoiseBurst({
  frames,
  seed,
  type = 'white',
  decayFrames = frames,
  gain = 1,
} = {}) {
  const safeFrames = Math.max(1, Math.floor(Number(frames) || 1));
  const source = type === 'pink'
    ? createPinkNoise(seed)
    : type === 'brown'
      ? createBrownNoise(seed)
      : createWhiteNoise(seed);
  const output = new Float32Array(safeFrames);
  const decay = Math.max(1, Number(decayFrames) || safeFrames);
  for (let index = 0; index < safeFrames; index += 1) {
    const envelope = Math.exp(-index / decay);
    output[index] = sanitizeSample(source() * envelope * gain);
  }
  return output;
}
