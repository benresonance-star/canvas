import { sanitizeSample } from '../dsp/sanitizeSample.js';

export function createAudioBlock({ channels = 2, frames = 128 } = {}) {
  const safeChannels = Math.max(1, Math.floor(Number(channels) || 1));
  const safeFrames = Math.max(1, Math.floor(Number(frames) || 1));
  return Array.from({ length: safeChannels }, () => new Float32Array(safeFrames));
}

export function clearAudioBlock(block) {
  for (const channel of block ?? []) channel?.fill?.(0);
  return block;
}

export function validateAudioBlock(block) {
  if (!Array.isArray(block) || block.length === 0) return false;
  const frames = block[0]?.length;
  return Number.isInteger(frames) && frames > 0 && block.every((channel) => channel?.length === frames);
}

export function analyzeAudioBlock(block) {
  if (!validateAudioBlock(block)) return { frames: 0, channels: 0, peak: 0, rms: 0 };
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  for (const channel of block) {
    for (const sample of channel) {
      const value = sanitizeSample(sample);
      peak = Math.max(peak, Math.abs(value));
      sumSquares += value * value;
      count += 1;
    }
  }
  return {
    frames: block[0].length,
    channels: block.length,
    peak,
    rms: count > 0 ? Math.sqrt(sumSquares / count) : 0,
  };
}
