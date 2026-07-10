import {
  applyPocket,
  buildPatternEvents,
  createDefaultPocketState,
  normalizePocketState,
  seededUnitValue,
} from '../pocket/index.js';

export const GLITCH_PROFILE_IDS = [
  'subtle',
  'stutter',
  'broken',
  'idm',
  'fill-driven',
  'sonic-fracture',
  'custom',
];

const ROLE_ORDER = {
  kick: 0,
  snare: 1,
  clap: 2,
  hat: 3,
  'hat-closed': 3,
  closedHat: 3,
  openHat: 4,
  tom: 5,
  rim: 6,
  percussion: 7,
};

const DEFAULT_OPERATIONS = {
  stutter: 0.28,
  ratchet: 0.22,
  dropout: 0.12,
  repeat: 0.18,
  pitch: 0.12,
  gate: 0.16,
};

const PROFILE_LIBRARY = {
  subtle: {
    id: 'subtle',
    name: 'Subtle',
    amount: 0.28,
    density: 0.18,
    phraseBias: 0.35,
    resetStrength: 0.85,
    operations: { stutter: 0.18, ratchet: 0.16, dropout: 0.08, repeat: 0.14, pitch: 0.1, gate: 0.2 },
    roleRules: {
      kick: { probability: 0.05, protectPrimary: true, maxRepeats: 2, pitchRange: 1 },
      snare: { probability: 0.18, protectPrimary: true, maxRepeats: 3, pitchRange: 3 },
      clap: { probability: 0.2, protectPrimary: false, maxRepeats: 3, pitchRange: 3 },
      hat: { probability: 0.42, protectPrimary: false, maxRepeats: 4, pitchRange: 5 },
      percussion: { probability: 0.36, protectPrimary: false, maxRepeats: 4, pitchRange: 6 },
    },
  },
  stutter: {
    id: 'stutter',
    name: 'Stutter',
    amount: 0.58,
    density: 0.34,
    phraseBias: 0.64,
    resetStrength: 0.7,
    operations: { stutter: 0.54, ratchet: 0.22, dropout: 0.05, repeat: 0.2, pitch: 0.1, gate: 0.24 },
    roleRules: {
      kick: { probability: 0.08, protectPrimary: true, maxRepeats: 2, pitchRange: 1 },
      snare: { probability: 0.38, protectPrimary: true, maxRepeats: 5, pitchRange: 4 },
      clap: { probability: 0.32, protectPrimary: false, maxRepeats: 4, pitchRange: 4 },
      hat: { probability: 0.48, protectPrimary: false, maxRepeats: 6, pitchRange: 5 },
      percussion: { probability: 0.44, protectPrimary: false, maxRepeats: 6, pitchRange: 7 },
    },
  },
  broken: {
    id: 'broken',
    name: 'Broken',
    amount: 0.62,
    density: 0.36,
    phraseBias: 0.48,
    resetStrength: 0.58,
    operations: { stutter: 0.18, ratchet: 0.18, dropout: 0.34, repeat: 0.26, pitch: 0.22, gate: 0.26 },
    roleRules: {
      kick: { probability: 0.1, protectPrimary: true, maxRepeats: 2, pitchRange: 1 },
      snare: { probability: 0.28, protectPrimary: true, maxRepeats: 3, pitchRange: 4 },
      clap: { probability: 0.32, protectPrimary: false, maxRepeats: 3, pitchRange: 5 },
      hat: { probability: 0.5, protectPrimary: false, maxRepeats: 4, pitchRange: 7 },
      percussion: { probability: 0.5, protectPrimary: false, maxRepeats: 4, pitchRange: 8 },
    },
  },
  idm: {
    id: 'idm',
    name: 'IDM',
    amount: 0.72,
    density: 0.46,
    phraseBias: 0.72,
    resetStrength: 0.62,
    operations: { stutter: 0.34, ratchet: 0.48, dropout: 0.14, repeat: 0.22, pitch: 0.28, gate: 0.34 },
    roleRules: {
      kick: { probability: 0.12, protectPrimary: true, maxRepeats: 2, pitchRange: 2 },
      snare: { probability: 0.34, protectPrimary: true, maxRepeats: 5, pitchRange: 5 },
      clap: { probability: 0.34, protectPrimary: false, maxRepeats: 4, pitchRange: 5 },
      hat: { probability: 0.62, protectPrimary: false, maxRepeats: 8, pitchRange: 9 },
      percussion: { probability: 0.64, protectPrimary: false, maxRepeats: 8, pitchRange: 10 },
    },
  },
  'fill-driven': {
    id: 'fill-driven',
    name: 'Fill Driven',
    amount: 0.5,
    density: 0.24,
    phraseBias: 0.95,
    resetStrength: 0.9,
    operations: { stutter: 0.42, ratchet: 0.28, dropout: 0.06, repeat: 0.3, pitch: 0.14, gate: 0.18 },
    roleRules: {
      kick: { probability: 0.04, protectPrimary: true, maxRepeats: 2, pitchRange: 1 },
      snare: { probability: 0.42, protectPrimary: true, maxRepeats: 6, pitchRange: 4 },
      clap: { probability: 0.34, protectPrimary: false, maxRepeats: 4, pitchRange: 4 },
      hat: { probability: 0.42, protectPrimary: false, maxRepeats: 6, pitchRange: 6 },
      percussion: { probability: 0.44, protectPrimary: false, maxRepeats: 6, pitchRange: 7 },
    },
  },
  'sonic-fracture': {
    id: 'sonic-fracture',
    name: 'Sonic Fracture',
    amount: 0.64,
    density: 0.38,
    phraseBias: 0.66,
    resetStrength: 0.62,
    operations: { stutter: 0.24, ratchet: 0.26, dropout: 0.12, repeat: 0.2, pitch: 0.42, gate: 0.34 },
    sonic: { enabled: true, intensity: 0.5, temporalSend: 0.28, toneOffset: 0.18 },
    roleRules: {
      kick: { probability: 0.08, protectPrimary: true, maxRepeats: 2, pitchRange: 2 },
      snare: { probability: 0.32, protectPrimary: true, maxRepeats: 4, pitchRange: 6 },
      clap: { probability: 0.34, protectPrimary: false, maxRepeats: 4, pitchRange: 6 },
      hat: { probability: 0.58, protectPrimary: false, maxRepeats: 6, pitchRange: 12 },
      percussion: { probability: 0.56, protectPrimary: false, maxRepeats: 6, pitchRange: 12 },
    },
  },
};

export function createDefaultGlitchState(overrides = {}) {
  return normalizeGlitchState({
    enabled: false,
    bypass: false,
    profileId: 'subtle',
    amount: 0.35,
    density: 0.25,
    phraseBias: 0.5,
    phraseLengthLoops: 4,
    resetStrength: 0.75,
    seed: 18429,
    operations: DEFAULT_OPERATIONS,
    roleRules: {},
    safety: null,
    sonic: {
      enabled: false,
      intensity: 0,
      temporalSend: 0,
      toneOffset: 0,
      distortionAmount: 0,
    },
    customProfile: null,
    updatedAt: null,
    ...overrides,
  });
}

export function normalizeGlitchState(state = {}) {
  const profileId = GLITCH_PROFILE_IDS.includes(state.profileId) ? state.profileId : 'subtle';
  return {
    enabled: state.enabled === true,
    bypass: state.bypass === true,
    profileId,
    amount: clamp01(state.amount ?? 0.35),
    density: clamp01(state.density ?? 0.25),
    phraseBias: clamp01(state.phraseBias ?? 0.5),
    phraseLengthLoops: clampInteger(state.phraseLengthLoops ?? 4, 1, 8),
    resetStrength: clamp01(state.resetStrength ?? 0.75),
    seed: normalizeSeed(state.seed),
    operations: normalizeOperationWeights(state.operations),
    roleRules: normalizeRuleMap(state.roleRules),
    safety: normalizeSafety(state.safety),
    sonic: normalizeSonic(state.sonic),
    customProfile: state.customProfile && typeof state.customProfile === 'object' ? state.customProfile : null,
    updatedAt: state.updatedAt ?? null,
  };
}

export function resolveGlitchProfile(glitchState = {}) {
  const state = normalizeGlitchState(glitchState);
  const base = state.profileId === 'custom' && state.customProfile
    ? state.customProfile
    : PROFILE_LIBRARY[state.profileId] ?? PROFILE_LIBRARY.subtle;
  return {
    ...base,
    id: state.profileId === 'custom' ? 'custom' : base.id,
    amount: state.amount,
    density: state.density,
    phraseBias: state.phraseBias,
    phraseLengthLoops: state.phraseLengthLoops,
    resetStrength: state.resetStrength,
    operations: {
      ...normalizeOperationWeights(base.operations),
      ...state.operations,
    },
    roleRules: mergeRules(base.roleRules, state.roleRules),
    safety: {
      ...normalizeSafety(base.safety),
      ...state.safety,
    },
    sonic: {
      ...normalizeSonic(base.sonic),
      ...state.sonic,
    },
  };
}

export function applyGlitch(pocketEvents = [], glitchState = {}, context = {}) {
  const state = normalizeGlitchState(glitchState);
  const profile = resolveGlitchProfile(state);
  const loopBeats = Math.max(1, Number(context.loopBeats) || 4);
  const phraseLengthLoops = state.enabled && !state.bypass ? profile.phraseLengthLoops : 1;
  const output = [];

  for (let loopIndex = 0; loopIndex < phraseLengthLoops; loopIndex += 1) {
    const isPhraseStart = loopIndex === 0;
    const isPhraseEnd = loopIndex === phraseLengthLoops - 1;
    for (const event of pocketEvents) {
      const baseEvent = createBaseGlitchEvent(event, {
        loopIndex,
        loopBeats,
        profile,
        state,
      });
      if (!state.enabled || state.bypass) {
        output.push(baseEvent);
        continue;
      }
      const protectedAnchor = isProtectedAnchor(event, profile);
      const resetRoll = seededUnitValue(`${event.id}:reset:${loopIndex}`, state.seed);
      if (isPhraseStart && resetRoll < profile.resetStrength) {
        output.push(withTrace(baseEvent, 'reset', 'Phrase-start reset preserved base event'));
        continue;
      }
      const roleRule = ruleForRole(profile.roleRules, event.role);
      const phraseMultiplier = isPhraseEnd ? 1 + profile.phraseBias : 1 - profile.resetStrength * 0.35;
      const eligibility = clamp01(
        profile.amount
        * profile.density
        * clamp01(roleRule.probability ?? 0.25)
        * phraseMultiplier,
      );
      const eligibleRoll = seededUnitValue(`${event.id}:eligible:${loopIndex}:${profile.id}`, state.seed);
      if (protectedAnchor || eligibleRoll > eligibility) {
        output.push(baseEvent);
        continue;
      }
      const operation = selectOperation(profile.operations, `${event.id}:operation:${loopIndex}:${profile.id}`, state.seed);
      const mutated = mutateEvent(baseEvent, event, operation, {
        loopIndex,
        loopBeats,
        profile,
        state,
        roleRule,
        isPhraseEnd,
      });
      output.push(...mutated);
    }
  }

  return applySafety(output, profile.safety, loopBeats * phraseLengthLoops).sort(compareGlitchEvents);
}

export function buildGlitchSchedule(pattern, pocketState = {}, glitchState = {}, context = {}) {
  const tempoBpm = clampNumber(context.tempoBpm ?? context.bpm ?? 120, 30, 300);
  const sampleRate = clampNumber(context.sampleRate ?? 48000, 1, 384000);
  const stepCount = Math.max(1, Math.floor(Number(pattern?.stepCount) || 16));
  const loopBars = Math.max(1, Math.ceil(stepCount / 16));
  const stepsPerBar = stepCount / loopBars;
  const loopBeats = beatsPerBar(context.timeSignature) * loopBars;
  const pocket = normalizePocketState(pocketState ?? createDefaultPocketState());
  const glitch = normalizeGlitchState(glitchState ?? createDefaultGlitchState());
  const baseEvents = buildPatternEvents(pattern, {
    ...context,
    tempoBpm,
    stepsPerBar,
    loopBeats,
  });
  const pocketEvents = applyPocket(baseEvents, pocket, {
    ...context,
    tempoBpm,
    stepsPerBar,
    loopBeats,
  });
  const glitchEvents = applyGlitch(pocketEvents, glitch, {
    ...context,
    tempoBpm,
    stepsPerBar,
    loopBeats,
  });
  const secondsPerBeat = 60 / tempoBpm;
  const phraseLengthLoops = glitch.enabled && !glitch.bypass
    ? resolveGlitchProfile(glitch).phraseLengthLoops
    : 1;
  const schedule = glitchEvents
    .filter((event) => event.muted !== true)
    .map((event) => {
      const timeFrames = Math.round(event.scheduledBeat * secondsPerBeat * sampleRate);
      const durationFrames = event.durationBeats == null
        ? undefined
        : Math.max(1, Math.round(event.durationBeats * secondsPerBeat * sampleRate));
      return {
        timeFrames,
        trackId: event.trackId,
        role: event.role,
        sourceStep: event.sourceStep,
        velocity: clamp01(event.velocity),
        probabilityPass: event.probabilityPass !== false,
        articulation: event.articulation ?? 'normal',
        pitchOffsetSemitones: clampNumber(event.pitchOffsetSemitones ?? 0, -24, 24),
        durationFrames,
        gate: event.gate == null ? undefined : clampNumber(event.gate, 0.02, 1),
        reverse: event.reverse === true,
        gain: event.gain == null ? undefined : clampNumber(event.gain, 0, 1.5),
        toneOffset: event.toneOffset == null ? undefined : clampNumber(event.toneOffset, -1, 1),
        distortionAmount: event.distortionAmount == null ? undefined : clampNumber(event.distortionAmount, 0, 1),
        temporalSend: event.temporalSend == null ? undefined : clampNumber(event.temporalSend, 0, 1),
        sourceEventId: event.sourceEventId,
        mutationId: event.mutationId,
        operation: event.operation,
        traceId: `${event.trackId}:${event.sourceStep}:${event.mutationId}`,
      };
    })
    .sort(compareScheduleEvents);
  const enabled = (pocket.enabled && !pocket.bypass) || (glitch.enabled && !glitch.bypass);
  return {
    enabled,
    profileId: pocket.profileId,
    glitchEnabled: glitch.enabled && !glitch.bypass,
    glitchProfileId: glitch.profileId,
    sampleRate,
    tempoBpm,
    stepCount,
    stepsPerBar,
    loopBars,
    loopBeats,
    loopFrames: Math.max(1, Math.round(loopBeats * secondsPerBeat * sampleRate)),
    phraseLengthLoops,
    phraseFrames: Math.max(1, Math.round(loopBeats * phraseLengthLoops * secondsPerBeat * sampleRate)),
    events: schedule,
    debugEvents: glitchEvents,
  };
}

function createBaseGlitchEvent(event, { loopIndex, loopBeats, profile, state }) {
  const scheduledBeat = (event.pocketTimeBeats ?? event.baseTimeBeats ?? 0) + loopIndex * loopBeats;
  return {
    ...event,
    id: `${event.id}:loop-${loopIndex}:base`,
    sourceEventId: event.id,
    mutationId: `${profile.id}:${state.seed}:${loopIndex}:${event.id}:base`,
    loopIndex,
    phraseIndex: 0,
    scheduledBeat,
    velocity: clamp01(event.finalVelocity ?? event.velocity ?? 0.8),
    operation: 'base',
    trace: [
      ...(event.trace ?? []),
      { stage: 'glitch', reason: 'Base event', operation: 'base', loopIndex },
    ],
  };
}

function mutateEvent(baseEvent, sourceEvent, operation, options) {
  if (operation === 'dropout') {
    return [withTrace(applySonicOverrides({ ...baseEvent, muted: true, operation }, operation, options), operation, 'Dropped event')];
  }
  if (operation === 'stutter') return stutterEvents(baseEvent, sourceEvent, operation, options);
  if (operation === 'ratchet') return ratchetEvents(baseEvent, sourceEvent, operation, options);
  if (operation === 'repeat') return repeatEvents(baseEvent, sourceEvent, operation, options);
  if (operation === 'pitch') return [pitchEvent(baseEvent, sourceEvent, operation, options)];
  if (operation === 'gate') return [gateEvent(baseEvent, operation, options)];
  return [baseEvent];
}

function stutterEvents(baseEvent, sourceEvent, operation, { roleRule, state, profile, loopIndex }) {
  const maxRepeats = clampInteger(roleRule.maxRepeats ?? 4, 2, profile.safety.maxEventsPerSource);
  const roll = seededUnitValue(`${sourceEvent.id}:stutter:count:${loopIndex}`, state.seed);
  const count = 2 + Math.floor(roll * Math.max(1, maxRepeats - 1));
  const interval = 1 / (16 + Math.floor(seededUnitValue(`${sourceEvent.id}:stutter:rate:${loopIndex}`, state.seed) * 16));
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const stuttered = {
      ...baseEvent,
      id: `${baseEvent.id}:stutter-${index}`,
      mutationId: `${baseEvent.mutationId}:stutter-${index}`,
      scheduledBeat: baseEvent.scheduledBeat + interval * index,
      velocity: clamp01(baseEvent.velocity * (1 - index * 0.12)),
      gate: clampNumber(0.7 - index * 0.08, 0.12, 1),
      operation,
    };
    events.push(withTrace(
      applySonicOverrides(stuttered, operation, { roleRule, state, profile, loopIndex, index }),
      operation,
      `${count}-hit stutter`,
    ));
  }
  return events;
}

function ratchetEvents(baseEvent, sourceEvent, operation, { roleRule, state, profile, loopIndex }) {
  const maxRepeats = clampInteger(roleRule.maxRepeats ?? 4, 2, profile.safety.maxEventsPerSource);
  const choices = [2, 3, 4, 6, 8].filter((count) => count <= maxRepeats);
  const count = choices[Math.floor(seededUnitValue(`${sourceEvent.id}:ratchet:${loopIndex}`, state.seed) * choices.length)] ?? 2;
  const interval = 0.25 / count;
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const ratcheted = {
      ...baseEvent,
      id: `${baseEvent.id}:ratchet-${index}`,
      mutationId: `${baseEvent.mutationId}:ratchet-${index}`,
      scheduledBeat: baseEvent.scheduledBeat + interval * index,
      velocity: clamp01(baseEvent.velocity * (0.92 - index * 0.04)),
      gate: clampNumber(0.5, 0.08, 1),
      operation,
    };
    events.push(withTrace(
      applySonicOverrides(ratcheted, operation, { roleRule, state, profile, loopIndex, index }),
      operation,
      `${count}-hit ratchet`,
    ));
  }
  return events;
}

function repeatEvents(baseEvent, sourceEvent, operation, { state, profile, loopIndex, loopBeats, isPhraseEnd }) {
  const direction = isPhraseEnd ? -1 : 1;
  const spacingChoices = [0.25, 0.5, 0.75];
  const spacing = spacingChoices[
    Math.floor(seededUnitValue(`${sourceEvent.id}:repeat:spacing:${loopIndex}`, state.seed) * spacingChoices.length)
  ] ?? 0.5;
  const repeated = {
    ...baseEvent,
    id: `${baseEvent.id}:repeat`,
    mutationId: `${baseEvent.mutationId}:repeat`,
    scheduledBeat: clampNumber(baseEvent.scheduledBeat + spacing * direction, loopIndex * loopBeats, (loopIndex + 1) * loopBeats - 1e-5),
    velocity: clamp01(baseEvent.velocity * 0.72),
    gate: 0.72,
    operation,
  };
  return [
    withTrace(baseEvent, operation, 'Original retained before repeat'),
    withTrace(applySonicOverrides(repeated, operation, { state, profile, loopIndex, index: 1 }), operation, 'Repeated nearby event'),
  ];
}

function pitchEvent(baseEvent, sourceEvent, operation, { roleRule, state, loopIndex, profile }) {
  const range = Math.min(profile.safety.maxPitchShiftSemitones, clampNumber(roleRule.pitchRange ?? 4, 0, 24));
  const amount = Math.round((seededUnitValue(`${sourceEvent.id}:pitch:${loopIndex}`, state.seed) - 0.5) * 2 * range);
  return withTrace(applySonicOverrides({
    ...baseEvent,
    pitchOffsetSemitones: amount,
    operation,
  }, operation, { state, profile, loopIndex, amount }), operation, `Pitch offset ${amount} semitones`);
}

function gateEvent(baseEvent, operation, { state, profile, loopIndex }) {
  const gate = 0.18 + seededUnitValue(`${baseEvent.sourceEventId}:gate:${loopIndex}`, state.seed) * 0.42;
  return withTrace(applySonicOverrides({
    ...baseEvent,
    gate,
    operation,
  }, operation, { state, profile, loopIndex }), operation, `Gate ${gate.toFixed(2)}`);
}

function applySonicOverrides(event, operation, { state, profile, loopIndex, index = 0, amount = 0 } = {}) {
  const sonic = profile?.sonic ?? {};
  if (!sonic.enabled) return event;
  const intensity = clamp01(sonic.intensity ?? 0);
  if (intensity <= 0) return event;
  const polarity = seededUnitValue(`${event.sourceEventId}:${operation}:sonic:polarity:${loopIndex}:${index}`, state.seed) > 0.5 ? 1 : -1;
  const operationBoost = operation === 'pitch' ? 1.2
    : operation === 'gate' ? 0.9
      : operation === 'stutter' || operation === 'ratchet' ? 1.05
        : operation === 'repeat' ? 0.75
          : 0.6;
  const toneBase = operation === 'pitch' && amount !== 0
    ? Math.sign(amount)
    : polarity;
  return {
    ...event,
    gain: clampNumber((event.gain ?? 1) * (1 + intensity * 0.12 * operationBoost), 0, 1.5),
    toneOffset: clampNumber(
      (event.toneOffset ?? 0) + toneBase * clampNumber(sonic.toneOffset ?? 0, -1, 1) * intensity * operationBoost,
      -1,
      1,
    ),
    distortionAmount: clampNumber(
      (event.distortionAmount ?? 0) + clamp01(sonic.distortionAmount ?? 0) * intensity * operationBoost,
      0,
      1,
    ),
    temporalSend: clampNumber((event.temporalSend ?? 0) + clamp01(sonic.temporalSend ?? 0) * intensity * operationBoost, 0, 1),
  };
}

function applySafety(events, safety, phraseBeats) {
  const perSourceCounts = new Map();
  const perBeatCounts = new Map();
  const output = [];
  for (const event of events.sort(compareGlitchEvents)) {
    if (!Number.isFinite(event.scheduledBeat) || event.scheduledBeat < 0 || event.scheduledBeat >= phraseBeats) continue;
    const sourceKey = `${event.sourceEventId}:${event.loopIndex}`;
    const sourceCount = perSourceCounts.get(sourceKey) ?? 0;
    if (sourceCount >= safety.maxEventsPerSource) continue;
    const beatKey = Math.floor(event.scheduledBeat * 4) / 4;
    const beatCount = perBeatCounts.get(beatKey) ?? 0;
    if (beatCount >= safety.maxEventsPerBeat) continue;
    perSourceCounts.set(sourceKey, sourceCount + 1);
    perBeatCounts.set(beatKey, beatCount + 1);
    output.push({
      ...event,
      scheduledBeat: clampNumber(event.scheduledBeat, 0, phraseBeats - 1e-5),
      velocity: clamp01(event.velocity),
      pitchOffsetSemitones: event.pitchOffsetSemitones == null
        ? undefined
        : clampNumber(event.pitchOffsetSemitones, -safety.maxPitchShiftSemitones, safety.maxPitchShiftSemitones),
      gate: event.gate == null ? undefined : clampNumber(event.gate, safety.maxGateMin, 1),
    });
    if (output.length >= safety.maxEventsPerPhrase) break;
  }
  return output;
}

function withTrace(event, operation, reason) {
  return {
    ...event,
    trace: [
      ...(event.trace ?? []),
      { stage: 'glitch', operation, reason },
    ],
  };
}

function isProtectedAnchor(event, profile) {
  const roleRule = ruleForRole(profile.roleRules, event.role);
  if (!roleRule.protectPrimary) return false;
  if (profile.safety.preserveDownbeat && event.role === 'kick' && event.sourceStep === 0) return true;
  if (profile.safety.preserveBackbeat && (event.role === 'snare' || event.role === 'clap')) {
    return event.sourceStep === 4 || event.sourceStep === 12;
  }
  return false;
}

function selectOperation(weights, key, seed) {
  const entries = Object.entries(normalizeOperationWeights(weights)).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return 'gate';
  let cursor = seededUnitValue(key, seed) * total;
  for (const [operation, value] of entries) {
    cursor -= value;
    if (cursor <= 0) return operation;
  }
  return entries.at(-1)?.[0] ?? 'gate';
}

function compareGlitchEvents(left, right) {
  return left.scheduledBeat - right.scheduledBeat
    || (ROLE_ORDER[left.role] ?? 99) - (ROLE_ORDER[right.role] ?? 99)
    || String(left.trackId).localeCompare(String(right.trackId))
    || String(left.mutationId).localeCompare(String(right.mutationId));
}

function compareScheduleEvents(left, right) {
  return left.timeFrames - right.timeFrames
    || (ROLE_ORDER[left.role] ?? 99) - (ROLE_ORDER[right.role] ?? 99)
    || String(left.trackId).localeCompare(String(right.trackId))
    || String(left.mutationId).localeCompare(String(right.mutationId));
}

function normalizeOperationWeights(value = {}) {
  return {
    stutter: clamp01(value?.stutter ?? DEFAULT_OPERATIONS.stutter),
    ratchet: clamp01(value?.ratchet ?? DEFAULT_OPERATIONS.ratchet),
    dropout: clamp01(value?.dropout ?? DEFAULT_OPERATIONS.dropout),
    repeat: clamp01(value?.repeat ?? DEFAULT_OPERATIONS.repeat),
    pitch: clamp01(value?.pitch ?? DEFAULT_OPERATIONS.pitch),
    gate: clamp01(value?.gate ?? DEFAULT_OPERATIONS.gate),
  };
}

function normalizeSafety(value = {}) {
  return {
    maxEventsPerSource: clampInteger(value?.maxEventsPerSource ?? 8, 1, 32),
    maxEventsPerBeat: clampInteger(value?.maxEventsPerBeat ?? 16, 1, 64),
    maxEventsPerPhrase: clampInteger(value?.maxEventsPerPhrase ?? 512, 1, 4096),
    maxPitchShiftSemitones: clampNumber(value?.maxPitchShiftSemitones ?? 12, 0, 24),
    maxTimingShiftBeats: clampNumber(value?.maxTimingShiftBeats ?? 0.25, 0, 4),
    maxGateMin: clampNumber(value?.maxGateMin ?? 0.05, 0.01, 1),
    preserveDownbeat: value?.preserveDownbeat !== false,
    preserveBackbeat: value?.preserveBackbeat !== false,
    allowCrossBar: value?.allowCrossBar === true,
    allowReverse: value?.allowReverse === true,
  };
}

function normalizeSonic(value = {}) {
  return {
    enabled: value?.enabled === true,
    intensity: clamp01(value?.intensity ?? 0),
    temporalSend: clamp01(value?.temporalSend ?? 0),
    toneOffset: clampNumber(value?.toneOffset ?? 0, -1, 1),
    distortionAmount: clamp01(value?.distortionAmount ?? 0),
  };
}

function normalizeRuleMap(value = {}) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const [key, rule] of Object.entries(value)) {
    if (rule && typeof rule === 'object') normalized[key] = { ...rule };
  }
  return normalized;
}

function ruleForRole(rules = {}, role) {
  return rules[role] ?? rules[normalizeRole(role)] ?? rules.percussion ?? {};
}

function mergeRules(base = {}, override = {}) {
  const merged = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override ?? {})) {
    merged[key] = { ...(merged[key] ?? {}), ...(value ?? {}) };
  }
  return merged;
}

function normalizeRole(role) {
  if (role === 'hat-closed' || role === 'closedHat' || role === 'openHat') return 'hat';
  return role || 'unknown';
}

function beatsPerBar(timeSignature = { numerator: 4, denominator: 4 }) {
  return Math.max(1, Number(timeSignature?.numerator) || 4);
}

function normalizeSeed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 18429;
  return Math.max(0, Math.floor(number)) >>> 0;
}

function clamp01(value) {
  return clampNumber(value, 0, 1);
}

function clampInteger(value, min, max) {
  return Math.floor(clampNumber(value, min, max));
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
