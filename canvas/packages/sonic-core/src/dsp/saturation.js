import { clamp, sanitizeSample } from './sanitizeSample.js';

export function softClip(input, drive = 1) {
  const safeDrive = clamp(drive, 0.001, 64);
  return sanitizeSample(Math.tanh(sanitizeSample(input) * safeDrive));
}

export function asymmetricSoftClip(input, { drive = 1, bias = 0.1 } = {}) {
  const safeDrive = clamp(drive, 0.001, 64);
  const safeBias = clamp(bias, -1, 1);
  return sanitizeSample(
    Math.tanh(safeDrive * (sanitizeSample(input) + safeBias)) - Math.tanh(safeDrive * safeBias),
  );
}

export function saturateSample(input, { mode = 'soft', drive = 1, bias = 0.1, damping = 0 } = {}) {
  const driven = mode === 'asymmetric' || mode === 'transformer'
    ? asymmetricSoftClip(input, { drive, bias })
    : softClip(input, drive);
  if (mode === 'tape') {
    return sanitizeSample(driven * (1 - clamp(damping, 0, 0.8)));
  }
  if (mode === 'transformer') {
    return sanitizeSample(driven + Math.sin(input * Math.PI) * 0.02);
  }
  return driven;
}
