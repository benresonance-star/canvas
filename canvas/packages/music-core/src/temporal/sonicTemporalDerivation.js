import { clampDescriptorValue } from '../descriptors/descriptorGraph.js';

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.max(min, Math.min(max, Number(value)));
}

export function deriveSonicTemporalFromDescriptors(sonicTemporal = {}, descriptorGraph = {}, {
  macroDepth = 0.65,
} = {}) {
  const base = normalizeSonicTemporal(sonicTemporal);
  const depth = clamp(macroDepth, 0, 1);
  if (depth <= 0.001) return base;

  const descriptors = descriptorGraph?.descriptors ?? {};
  const dreaminess = descriptors.Dreaminess?.value ?? 0.5;
  const persistence = descriptors.Persistence?.value ?? 0.5;
  const brightness = descriptors.Brightness?.value ?? 0.5;
  const weight = descriptors.Weight?.value ?? 0.5;
  const tension = descriptors.Tension?.value ?? 0.5;

  const delayWetDelta = (dreaminess - 0.5) * 0.28 * depth;
  const delayFeedbackDelta = ((persistence - 0.5) * 0.34 + (tension - 0.5) * 0.12) * depth;
  const delayDampingDelta = ((weight - 0.5) * 0.18 + (brightness - 0.5) * 0.12) * depth;
  const shimmerWetDelta = (dreaminess - 0.5) * 0.22 * depth;
  const shimmerEnable = base.shimmer.enabled || dreaminess > 0.62 + (1 - depth) * 0.2;
  const freezeWetDelta = (persistence - 0.5) * 0.24 * depth;

  return normalizeSonicTemporal({
    ...base,
    delay: {
      ...base.delay,
      wet: clamp(base.delay.wet + delayWetDelta),
      feedback: clamp(base.delay.feedback + delayFeedbackDelta, 0, 0.92),
      damping: clamp(base.delay.damping + delayDampingDelta),
    },
    shimmer: {
      ...base.shimmer,
      enabled: shimmerEnable,
      wet: clamp(base.shimmer.wet + shimmerWetDelta),
      damping: clamp(base.shimmer.damping + (1 - brightness) * 0.12 * depth),
    },
    freeze: {
      ...base.freeze,
      wet: clamp(base.freeze.wet + freezeWetDelta),
      feedback: clamp(base.freeze.feedback + (persistence - 0.5) * 0.004 * depth, 0.9, 0.999),
    },
  });
}

export function normalizeSonicTemporal(state = {}) {
  return {
    enabled: state.enabled !== false,
    delay: {
      enabled: state.delay?.enabled !== false,
      delayMs: clamp(state.delay?.delayMs ?? 240, 1, 4000),
      feedback: clamp(state.delay?.feedback ?? 0.28, 0, 0.92),
      wet: clamp(state.delay?.wet ?? 0.18),
      damping: clamp(state.delay?.damping ?? 0.3),
      mode: state.delay?.mode ?? 'stereo',
    },
    shimmer: {
      enabled: state.shimmer?.enabled === true,
      pitchRatio: clamp(state.shimmer?.pitchRatio ?? 2, 0.25, 4),
      feedback: clamp(state.shimmer?.feedback ?? 0.48, 0, 0.9),
      wet: clamp(state.shimmer?.wet ?? 0.18),
      damping: clamp(state.shimmer?.damping ?? 0.28),
    },
    freeze: {
      enabled: state.freeze?.enabled === true,
      wet: clamp(state.freeze?.wet ?? 0.35),
      feedback: clamp(state.freeze?.feedback ?? 0.995, 0.9, 0.999),
    },
  };
}

export function createDefaultBeatSonicTemporalState(overrides = {}) {
  return normalizeSonicTemporal({
    enabled: true,
    delay: { enabled: true, delayMs: 240, feedback: 0.28, wet: 0.18, damping: 0.3 },
    shimmer: { enabled: false, pitchRatio: 2, feedback: 0.48, wet: 0.18, damping: 0.28 },
    freeze: { enabled: false, wet: 0.35, feedback: 0.995 },
    ...overrides,
  });
}

export function createDefaultBeatAudioRouting(overrides = {}) {
  return {
    sonicTemporalBypass: overrides.sonicTemporalBypass === true,
    acousticSpaceBypass: overrides.acousticSpaceBypass === true,
    descriptorGraphBypass: overrides.descriptorGraphBypass !== false,
    descriptorMacroDepth: clamp(overrides.descriptorMacroDepth ?? 0.65, 0, 1),
    freezeHold: overrides.freezeHold === true,
  };
}

export function createDefaultBeatMixSettings(overrides = {}) {
  return {
    roleSendLevels: {
      kick: clamp(overrides.roleSendLevels?.kick ?? 0.08),
      snare: clamp(overrides.roleSendLevels?.snare ?? 0.22),
      clap: clamp(overrides.roleSendLevels?.clap ?? 0.26),
      hat: clamp(overrides.roleSendLevels?.hat ?? 0.18),
      'hat-closed': clamp(overrides.roleSendLevels?.['hat-closed'] ?? 0.18),
    },
    returnLowCutHz: clamp(overrides.returnLowCutHz ?? 120, 20, 800),
    returnHighCutHz: clamp(overrides.returnHighCutHz ?? 12000, 2000, 20000),
    preFxHeadroomDb: clamp(overrides.preFxHeadroomDb ?? -6, -24, 0),
    maxWet: clamp(overrides.maxWet ?? 0.85, 0, 1),
  };
}
