import { clamp } from '../dsp/sanitizeSample.js';

export function createTemporalState(overrides = {}) {
  return {
    enabled: overrides.enabled !== false,
    delay: {
      enabled: overrides.delay?.enabled !== false,
      delayMs: clamp(overrides.delay?.delayMs ?? 240, 1, 4000),
      feedback: clamp(overrides.delay?.feedback ?? 0.28, 0, 0.92),
      wet: clamp(overrides.delay?.wet ?? 0.18),
      damping: clamp(overrides.delay?.damping ?? 0.3),
      mode: overrides.delay?.mode ?? 'stereo',
    },
    fdnReverb: {
      enabled: overrides.fdnReverb?.enabled === true,
      size: clamp(overrides.fdnReverb?.size ?? 0.45),
      feedback: clamp(overrides.fdnReverb?.feedback ?? 0.62, 0, 0.96),
      wet: clamp(overrides.fdnReverb?.wet ?? 0.22),
      damping: clamp(overrides.fdnReverb?.damping ?? 0.35),
    },
    shimmer: {
      enabled: overrides.shimmer?.enabled === true,
      pitchRatio: clamp(overrides.shimmer?.pitchRatio ?? 2, 0.25, 4),
      feedback: clamp(overrides.shimmer?.feedback ?? 0.48, 0, 0.9),
      wet: clamp(overrides.shimmer?.wet ?? 0.18),
      damping: clamp(overrides.shimmer?.damping ?? 0.28),
    },
    freeze: {
      enabled: overrides.freeze?.enabled === true,
      wet: clamp(overrides.freeze?.wet ?? 0.35),
      feedback: clamp(overrides.freeze?.feedback ?? 0.995, 0.9, 0.999),
    },
    resonator: {
      enabled: overrides.resonator?.enabled === true,
      amount: clamp(overrides.resonator?.amount ?? 0.18),
      frequencyHz: clamp(overrides.resonator?.frequencyHz ?? 220, 20, 12000),
    },
  };
}
