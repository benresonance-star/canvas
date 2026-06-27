export const MUSIC_DESCRIPTORS = [
  'Energy',
  'Tension',
  'Space',
  'Intimacy',
  'Motion',
  'Weight',
  'Brightness',
  'Human Feel',
  'Complexity',
  'Novelty',
  'Release',
  'Dreaminess',
  'Persistence',
  'Fragility',
  'Pressure',
];

const DESCRIPTOR_DETAILS = {
  Energy: {
    meaning: 'How forceful and active the sketch feels.',
    affectedSystems: ['beat density', 'performer velocity', 'temporal feedback'],
    technicalMappings: { gain: 0.25, density: 0.5, feedback: 0.18 },
  },
  Tension: {
    meaning: 'How unresolved, compressed, or expectant the sketch feels.',
    affectedSystems: ['harmony', 'delay feedback', 'space size'],
    technicalMappings: { dissonance: 0.45, feedback: 0.36, diffusion: 0.22 },
  },
  Space: {
    meaning: 'How much perceived room and distance surrounds the sketch.',
    affectedSystems: ['acoustic space', 'send matrix', 'spatial routing'],
    technicalMappings: { roomSize: 0.65, sendLevel: 0.45, width: 0.6 },
  },
  Intimacy: {
    meaning: 'How close, dry, and human-scale the sketch feels.',
    affectedSystems: ['room distance', 'dry/wet balance', 'performer dynamics'],
    technicalMappings: { dryLevel: 0.72, earlyReflections: 0.25, width: 0.18 },
  },
  Motion: {
    meaning: 'How much the sketch feels like it is moving or evolving.',
    affectedSystems: ['groove', 'modulation', 'automation'],
    technicalMappings: { swing: 0.28, modulationDepth: 0.34, automationRate: 0.4 },
  },
  Weight: {
    meaning: 'How much low-frequency mass and groundedness the sketch carries.',
    affectedSystems: ['bass performer', 'tone', 'beat synthesis'],
    technicalMappings: { lowShelf: 0.55, kickGain: 0.36, damping: 0.22 },
  },
  Brightness: {
    meaning: 'How open, sharp, or high-frequency-forward the sketch feels.',
    affectedSystems: ['tone filters', 'space damping', 'delay tone'],
    technicalMappings: { cutoff: 0.72, damping: 0.18, shimmer: 0.16 },
  },
  'Human Feel': {
    meaning: 'How imperfect, played, and non-gridlocked the sketch feels.',
    affectedSystems: ['groove', 'microtiming', 'velocity variation'],
    technicalMappings: { microtimingMs: 8, velocitySpread: 0.18, swing: 0.2 },
  },
  Complexity: {
    meaning: 'How many independent details compete for attention.',
    affectedSystems: ['performer density', 'variation count', 'reflection analysis'],
    technicalMappings: { activeLanes: 0.42, noteDensity: 0.55, tapCount: 0.35 },
  },
  Novelty: {
    meaning: 'How surprising or unfamiliar the sketch feels.',
    affectedSystems: ['variation engine', 'AI suggestions', 'temporal topology'],
    technicalMappings: { mutationDepth: 0.62, topologyShift: 0.4, randomization: 0.35 },
  },
  Release: {
    meaning: 'How much the sketch resolves pressure or creates relief.',
    affectedSystems: ['arrangement', 'harmony', 'feedback decay'],
    technicalMappings: { feedback: -0.24, density: -0.32, consonance: 0.4 },
  },
  Dreaminess: {
    meaning: 'How blurred, suspended, or unreal the sketch feels.',
    affectedSystems: ['diffusion', 'space', 'granular and freeze modes'],
    technicalMappings: { diffusion: 0.68, wetLevel: 0.48, modulationDepth: 0.28 },
  },
  Persistence: {
    meaning: 'How long gestures linger after they are played.',
    affectedSystems: ['delay feedback', 'reverb decay', 'freeze'],
    technicalMappings: { feedback: 0.56, decaySeconds: 0.52, freezeChance: 0.14 },
  },
  Fragility: {
    meaning: 'How delicate, unstable, or easily broken the sketch feels.',
    affectedSystems: ['performer dynamics', 'tone', 'modulation'],
    technicalMappings: { gain: -0.18, wowFlutter: 0.24, highpass: 0.2 },
  },
  Pressure: {
    meaning: 'How much intensity, density, or forward force bears down.',
    affectedSystems: ['beat density', 'limiting safety', 'reflection analysis'],
    technicalMappings: { density: 0.46, compression: 0.32, limiterCeiling: -1 },
  },
};

export function clampDescriptorValue(value) {
  if (!Number.isFinite(Number(value))) return 0.5;
  return Math.max(0, Math.min(1, Number(value)));
}

export function createDefaultDescriptorGraph(overrides = {}) {
  const descriptors = {};
  for (const name of MUSIC_DESCRIPTORS) {
    const override = overrides.descriptors?.[name] ?? overrides[name] ?? {};
    descriptors[name] = {
      name,
      value: clampDescriptorValue(override.value ?? 0.5),
      ...DESCRIPTOR_DETAILS[name],
      mappings: {
        ...DESCRIPTOR_DETAILS[name].technicalMappings,
        ...(override.mappings ?? {}),
      },
    };
  }
  return {
    schemaVersion: 1,
    descriptors,
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

export function updateDescriptorValue(graph, name, value) {
  const base = createDefaultDescriptorGraph(graph ?? {});
  if (!base.descriptors[name]) {
    return { ok: false, reason: 'Unknown descriptor', graph: base };
  }
  return {
    ok: true,
    graph: {
      ...base,
      descriptors: {
        ...base.descriptors,
        [name]: {
          ...base.descriptors[name],
          value: clampDescriptorValue(value),
        },
      },
      updatedAt: new Date().toISOString(),
    },
  };
}

export function driveDescriptorMappings(descriptor, value) {
  const normalized = clampDescriptorValue(value);
  const baseMappings = descriptor?.technicalMappings ?? descriptor?.mappings ?? {};
  return Object.fromEntries(
    Object.entries(baseMappings).map(([key, baseValue]) => [
      key,
      scaleDescriptorMappingValue(baseValue, normalized),
    ]),
  );
}

export function scaleDescriptorMappingValue(baseValue, normalizedValue) {
  const value = Number(baseValue);
  if (!Number.isFinite(value)) return baseValue;
  const normalized = clampDescriptorValue(normalizedValue);
  const factor = Math.abs(value) <= 1 ? 0.35 + normalized * 1.3 : 0.5 + normalized;
  return Number((value * factor).toFixed(3));
}

export function summarizeDescriptorGraph(graph) {
  const normalized = createDefaultDescriptorGraph(graph ?? {});
  return MUSIC_DESCRIPTORS.map((name) => ({
    name,
    value: normalized.descriptors[name].value,
  }));
}
