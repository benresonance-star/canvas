export const TEMPORAL_TOPOLOGIES = [
  'digital',
  'tape',
  'bbd',
  'ping-pong',
  'multi-tap',
  'reverse',
  'pitch-delay',
  'diffused-delay',
  'freeze',
  'granular',
  'swarm',
];

export function createDefaultTemporalState(overrides = {}) {
  return {
    schemaVersion: 1,
    topology: TEMPORAL_TOPOLOGIES.includes(overrides.topology) ? overrides.topology : 'digital',
    timeDivision: overrides.timeDivision ?? '1/8',
    delayMs: Number.isFinite(overrides.delayMs) ? overrides.delayMs : 250,
    feedback: clamp(overrides.feedback ?? 0.28, 0, 0.92),
    wet: clamp(overrides.wet ?? 0.18, 0, 1),
    character: {
      drive: clamp(overrides.character?.drive ?? 0.05, 0, 1),
      age: clamp(overrides.character?.age ?? 0, 0, 1),
      noise: clamp(overrides.character?.noise ?? 0, 0, 1),
    },
    diffusion: clamp(overrides.diffusion ?? 0.12, 0, 1),
    modulation: {
      rateHz: clamp(overrides.modulation?.rateHz ?? 0.2, 0, 12),
      depth: clamp(overrides.modulation?.depth ?? 0.08, 0, 1),
    },
    tone: {
      lowCutHz: clamp(overrides.tone?.lowCutHz ?? 120, 20, 1200),
      highCutHz: clamp(overrides.tone?.highCutHz ?? 9000, 1200, 20000),
    },
    spatialRouting: overrides.spatialRouting ?? { target: 'shared-space', width: 0.5 },
    taps: Array.isArray(overrides.taps) ? overrides.taps : undefined,
    pitchSemitones: clamp(overrides.pitchSemitones ?? 0, -24, 24),
    freeze: {
      armed: overrides.freeze?.armed === true,
      threshold: clamp(overrides.freeze?.threshold ?? 0.72, 0, 1),
    },
    grainMs: clamp(overrides.grainMs ?? 80, 12, 240),
    voices: Math.round(clamp(overrides.voices ?? 4, 1, 12)),
    automation: Array.isArray(overrides.automation) ? overrides.automation : [],
    variations: Array.isArray(overrides.variations) ? overrides.variations : [],
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

export function deriveTemporalFromDescriptors(temporalState, descriptorGraph) {
  const state = createDefaultTemporalState(temporalState);
  const descriptors = descriptorGraph?.descriptors ?? {};
  const persistence = descriptors.Persistence?.value ?? 0.5;
  const dreaminess = descriptors.Dreaminess?.value ?? 0.5;
  const motion = descriptors.Motion?.value ?? 0.5;
  const pressure = descriptors.Pressure?.value ?? 0.5;
  return {
    ...state,
    feedback: clamp(0.12 + persistence * 0.62 + pressure * 0.08, 0, 0.92),
    wet: clamp(0.08 + dreaminess * 0.42 + persistence * 0.12, 0, 0.82),
    diffusion: clamp(dreaminess * 0.58 + state.diffusion * 0.2),
    modulation: {
      ...state.modulation,
      depth: clamp(motion * 0.36 + dreaminess * 0.18),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createTemporalTopologyPreset(topology) {
  const base = createDefaultTemporalState({ topology });
  switch (topology) {
    case 'tape':
      return createDefaultTemporalState({ ...base, feedback: 0.34, character: { drive: 0.18, age: 0.42, noise: 0.08 }, modulation: { rateHz: 0.35, depth: 0.18 } });
    case 'bbd':
      return createDefaultTemporalState({ ...base, delayMs: 180, feedback: 0.38, tone: { lowCutHz: 180, highCutHz: 4200 }, character: { drive: 0.12, age: 0.62, noise: 0.14 } });
    case 'ping-pong':
      return createDefaultTemporalState({ ...base, feedback: 0.32, spatialRouting: { target: 'shared-space', width: 0.95 } });
    case 'multi-tap':
      return createDefaultTemporalState({ ...base, feedback: 0.24, taps: [0.5, 0.75, 1, 1.5] });
    case 'reverse':
      return createDefaultTemporalState({ ...base, delayMs: 420, feedback: 0.2, wet: 0.28 });
    case 'pitch-delay':
      return createDefaultTemporalState({ ...base, pitchSemitones: 7, feedback: 0.3, wet: 0.24 });
    case 'diffused-delay':
      return createDefaultTemporalState({ ...base, diffusion: 0.72, feedback: 0.42, wet: 0.32 });
    case 'freeze':
      return createDefaultTemporalState({ ...base, feedback: 0.86, wet: 0.48, freeze: { armed: false, threshold: 0.72 } });
    case 'granular':
      return createDefaultTemporalState({ ...base, delayMs: 120, grainMs: 72, feedback: 0.26, wet: 0.34, modulation: { rateHz: 2.2, depth: 0.28 } });
    case 'swarm':
      return createDefaultTemporalState({ ...base, voices: 8, diffusion: 0.58, feedback: 0.36, wet: 0.36 });
    default:
      return base;
  }
}

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.max(min, Math.min(max, Number(value)));
}
