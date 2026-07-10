export const POCKET_PROFILE_IDS = [
  'tight',
  'laid-back',
  'forward',
  'deep-pocket',
  'loose-funk',
  'custom',
];

const DEFAULT_ACCENT_CYCLE = [
  1, 0.58, 0.78, 0.52,
  0.9, 0.56, 0.74, 0.5,
  0.96, 0.58, 0.8, 0.52,
  0.88, 0.54, 0.72, 0.48,
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

const PROFILE_LIBRARY = {
  tight: {
    id: 'tight',
    name: 'Tight',
    amount: 0.34,
    swing: 0.08,
    accentDepth: 0.2,
    variation: { enabled: true, timingRangeMs: 2, velocityRange: 0.025, repeatability: 0.9 },
    roleTiming: {
      kick: { offsetMs: 0, stability: 0.98, driftMs: 1 },
      snare: { offsetMs: 4, stability: 0.95, driftMs: 2 },
      clap: { offsetMs: 7, stability: 0.92, driftMs: 2 },
      hat: { offsetMs: -2, stability: 0.9, driftMs: 2 },
    },
    roleDynamics: {
      kick: { velocityScale: 1, stability: 0.96, accentResponse: 0.18 },
      snare: { velocityScale: 1, stability: 0.94, accentResponse: 0.22 },
      clap: { velocityScale: 0.96, stability: 0.92, accentResponse: 0.18 },
      hat: { velocityScale: 0.9, stability: 0.88, accentResponse: 0.32 },
    },
  },
  'laid-back': {
    id: 'laid-back',
    name: 'Laid Back',
    amount: 0.72,
    swing: 0.18,
    accentDepth: 0.34,
    variation: { enabled: true, timingRangeMs: 5, velocityRange: 0.05, repeatability: 0.76 },
    roleTiming: {
      kick: { offsetMs: 1, stability: 0.97, driftMs: 1 },
      snare: { offsetMs: 18, stability: 0.86, driftMs: 4 },
      clap: { offsetMs: 26, stability: 0.82, driftMs: 5 },
      hat: { offsetMs: 3, stability: 0.78, driftMs: 4 },
    },
    roleDynamics: {
      kick: { velocityScale: 1, stability: 0.96, accentResponse: 0.16 },
      snare: { velocityScale: 0.98, stability: 0.88, accentResponse: 0.26 },
      clap: { velocityScale: 0.9, stability: 0.84, accentResponse: 0.24 },
      hat: { velocityScale: 0.82, stability: 0.72, accentResponse: 0.44 },
    },
  },
  forward: {
    id: 'forward',
    name: 'Forward',
    amount: 0.66,
    swing: 0.1,
    accentDepth: 0.28,
    variation: { enabled: true, timingRangeMs: 4, velocityRange: 0.04, repeatability: 0.8 },
    roleTiming: {
      kick: { offsetMs: -2, stability: 0.96, driftMs: 2 },
      snare: { offsetMs: 3, stability: 0.9, driftMs: 3 },
      clap: { offsetMs: 10, stability: 0.86, driftMs: 4 },
      hat: { offsetMs: -9, stability: 0.74, driftMs: 4 },
    },
    roleDynamics: {
      kick: { velocityScale: 1.02, stability: 0.94, accentResponse: 0.18 },
      snare: { velocityScale: 1, stability: 0.9, accentResponse: 0.22 },
      clap: { velocityScale: 0.94, stability: 0.86, accentResponse: 0.22 },
      hat: { velocityScale: 0.96, stability: 0.72, accentResponse: 0.42 },
    },
  },
  'deep-pocket': {
    id: 'deep-pocket',
    name: 'Deep Pocket',
    amount: 0.82,
    swing: 0.2,
    accentDepth: 0.38,
    variation: { enabled: true, timingRangeMs: 4, velocityRange: 0.04, repeatability: 0.84 },
    roleTiming: {
      kick: { offsetMs: 0, stability: 0.99, driftMs: 1 },
      snare: { offsetMs: 24, stability: 0.9, driftMs: 3 },
      clap: { offsetMs: 30, stability: 0.86, driftMs: 4 },
      hat: { offsetMs: -7, stability: 0.78, driftMs: 4 },
    },
    roleDynamics: {
      kick: { velocityScale: 1, stability: 0.97, accentResponse: 0.14 },
      snare: { velocityScale: 0.96, stability: 0.9, accentResponse: 0.2 },
      clap: { velocityScale: 0.86, stability: 0.86, accentResponse: 0.18 },
      hat: { velocityScale: 0.78, stability: 0.74, accentResponse: 0.5 },
    },
  },
  'loose-funk': {
    id: 'loose-funk',
    name: 'Loose Funk',
    amount: 0.9,
    swing: 0.28,
    accentDepth: 0.56,
    variation: { enabled: true, timingRangeMs: 8, velocityRange: 0.08, repeatability: 0.62 },
    roleTiming: {
      kick: { offsetMs: -1, stability: 0.92, driftMs: 4 },
      snare: { offsetMs: 20, stability: 0.78, driftMs: 7 },
      clap: { offsetMs: 29, stability: 0.74, driftMs: 7 },
      hat: { offsetMs: -10, stability: 0.58, driftMs: 8 },
    },
    roleDynamics: {
      kick: { velocityScale: 1, stability: 0.88, accentResponse: 0.26 },
      snare: { velocityScale: 0.98, stability: 0.78, accentResponse: 0.34 },
      clap: { velocityScale: 0.86, stability: 0.72, accentResponse: 0.3 },
      hat: { velocityScale: 0.86, stability: 0.58, accentResponse: 0.72 },
    },
  },
};

export function createDefaultPocketState(overrides = {}) {
  return normalizePocketState({
    enabled: false,
    bypass: false,
    profileId: 'tight',
    amount: 0.65,
    swing: 0.12,
    accentDepth: 0.32,
    seed: 1337,
    customProfile: null,
    roleTiming: {},
    roleDynamics: {},
    accentCycle: DEFAULT_ACCENT_CYCLE,
    phraseShape: [1],
    variation: {
      enabled: true,
      timingRangeMs: 4,
      velocityRange: 0.04,
      repeatability: 0.8,
    },
    updatedAt: null,
    ...overrides,
  });
}

export function normalizePocketState(state = {}) {
  const profileId = POCKET_PROFILE_IDS.includes(state.profileId) ? state.profileId : 'tight';
  return {
    enabled: state.enabled === true,
    bypass: state.bypass === true,
    profileId,
    amount: clamp01(state.amount ?? 0.65),
    swing: clamp01(state.swing ?? 0.12),
    accentDepth: clamp01(state.accentDepth ?? 0.32),
    seed: normalizeSeed(state.seed),
    customProfile: state.customProfile && typeof state.customProfile === 'object' ? state.customProfile : null,
    roleTiming: normalizeRuleMap(state.roleTiming),
    roleDynamics: normalizeRuleMap(state.roleDynamics),
    accentCycle: normalizeNumberArray(state.accentCycle, DEFAULT_ACCENT_CYCLE, 0, 2),
    phraseShape: normalizeNumberArray(state.phraseShape, [1], 0, 2),
    variation: normalizeVariation(state.variation),
    updatedAt: state.updatedAt ?? null,
  };
}

export function resolvePocketProfile(pocketState = {}) {
  const state = normalizePocketState(pocketState);
  const base = state.profileId === 'custom' && state.customProfile
    ? state.customProfile
    : PROFILE_LIBRARY[state.profileId] ?? PROFILE_LIBRARY.tight;
  return {
    ...base,
    id: state.profileId === 'custom' ? 'custom' : base.id,
    amount: state.amount,
    swing: state.swing,
    accentDepth: state.accentDepth,
    roleTiming: mergeRules(base.roleTiming, state.roleTiming),
    roleDynamics: mergeRules(base.roleDynamics, state.roleDynamics),
    accentCycle: state.accentCycle?.length ? state.accentCycle : (base.accentCycle ?? DEFAULT_ACCENT_CYCLE),
    phraseShape: state.phraseShape?.length ? state.phraseShape : (base.phraseShape ?? [1]),
    variation: {
      ...normalizeVariation(base.variation),
      ...normalizeVariation(state.variation),
    },
  };
}

export function buildPatternEvents(pattern, context = {}) {
  const stepCount = Math.max(1, Math.floor(Number(pattern?.stepCount) || 16));
  const loopBars = Math.max(1, Math.ceil(stepCount / 16));
  const stepsPerBar = stepCount / loopBars;
  const events = [];
  for (const track of pattern?.tracks ?? []) {
    if (track?.muted) continue;
    const role = normalizeRole(track.role ?? track.id);
    for (let index = 0; index < stepCount; index += 1) {
      const step = track.steps?.[index];
      if (!step?.active) continue;
      const baseTimeBeats = stepToBeats(index, stepsPerBar, context.timeSignature);
      events.push({
        id: `${track.id}:${index}`,
        trackId: track.id,
        role,
        sourceStep: index,
        stepIndex: index,
        barIndex: Math.floor(index / stepsPerBar),
        stepPosition: index,
        beatPosition: baseTimeBeats,
        baseTimeBeats,
        velocity: clamp01(step.velocity ?? 0.85),
        probability: clamp01(step.probability ?? 1),
        microtimingMs: clampNumber(step.microtimingMs ?? 0, -60, 60),
        enabled: true,
        metadata: {
          trackName: track.name,
          originalRole: track.role,
        },
      });
    }
  }
  return events.sort(comparePocketEvents);
}

export function applyPocket(patternEvents = [], pocketState = {}, context = {}) {
  const state = normalizePocketState(pocketState);
  const tempoBpm = clampNumber(context.tempoBpm ?? context.bpm ?? 120, 30, 300);
  const stepsPerBar = Math.max(1, Number(context.stepsPerBar) || 16);
  const profile = resolvePocketProfile(state);
  const disabled = !state.enabled || state.bypass;
  return patternEvents.map((event) => {
    const baseWithStepMicro = event.baseTimeBeats + msToBeats(event.microtimingMs ?? 0, tempoBpm);
    if (disabled) {
      return {
        ...event,
        baseTimeBeats: event.baseTimeBeats,
        pocketTimeBeats: baseWithStepMicro,
        timingOffsetBeats: msToBeats(event.microtimingMs ?? 0, tempoBpm),
        timingOffsetMs: event.microtimingMs ?? 0,
        finalVelocity: clamp01(event.velocity),
        probabilityPass: probabilityPass(event, state.seed),
        pocketProfileId: profile.id,
        seed: state.seed,
        articulation: 'normal',
        trace: [{ stage: 'base', valueBefore: event.baseTimeBeats, valueAfter: baseWithStepMicro, reason: 'Pocket disabled' }],
      };
    }

    const trace = [{ stage: 'base', valueBefore: event.baseTimeBeats, valueAfter: baseWithStepMicro, reason: 'Step grid plus microtiming' }];
    let pocketTimeBeats = baseWithStepMicro;
    const swingMs = swingOffsetMs(event.sourceStep, profile.swing, stepsPerBar) * profile.amount;
    pocketTimeBeats = traceTime(trace, 'subdivision', pocketTimeBeats, pocketTimeBeats + msToBeats(swingMs, tempoBpm), 'Profile swing');

    const timingRule = ruleForRole(profile.roleTiming, event.role);
    const targetOffsetMs = clampNumber(timingRule.offsetMs ?? 0, -36, 36) * profile.amount;
    pocketTimeBeats = traceTime(trace, 'roleOffset', pocketTimeBeats, pocketTimeBeats + msToBeats(targetOffsetMs, tempoBpm), `${event.role} pocket offset`);

    const variation = profile.variation;
    if (variation.enabled) {
      const drift = seededCentered(`${event.id}:time:${event.sourceStep}:${event.role}`, state.seed)
        * clampNumber(timingRule.driftMs ?? variation.timingRangeMs, 0, 16)
        * (1 - clamp01(timingRule.stability ?? 0.8))
        * profile.amount;
      pocketTimeBeats = traceTime(trace, 'variation', pocketTimeBeats, pocketTimeBeats + msToBeats(drift, tempoBpm), 'Seeded timing variation');
    }

    const loopBeats = Math.max(1, Number(context.loopBeats) || 4);
    const clampedTime = clampNumber(pocketTimeBeats, 0, Math.max(0, loopBeats - 1e-5));
    pocketTimeBeats = traceTime(trace, 'clamp', pocketTimeBeats, clampedTime, 'Loop boundary clamp');

    const dynamicRule = ruleForRole(profile.roleDynamics, event.role);
    const accentValue = cycleValue(profile.accentCycle, event.sourceStep, 1);
    const phraseValue = cycleValue(profile.phraseShape, event.barIndex, 1);
    const accentScale = 1 + ((accentValue - 1) * profile.accentDepth * clamp01(dynamicRule.accentResponse ?? 0.35));
    let finalVelocity = event.velocity
      * clampNumber(dynamicRule.velocityScale ?? 1, 0, 2)
      * accentScale
      * phraseValue;
    if (variation.enabled) {
      finalVelocity += seededCentered(`${event.id}:velocity:${event.sourceStep}:${event.role}`, state.seed)
        * clampNumber(variation.velocityRange, 0, 0.2)
        * (1 - clamp01(dynamicRule.stability ?? 0.8));
    }
    finalVelocity = clampNumber(finalVelocity, 0.02, 1);
    const articulation = finalVelocity < 0.42 ? 'ghost' : accentValue > 0.92 ? 'accent' : 'normal';
    trace.push({ stage: 'accent', valueBefore: event.velocity, valueAfter: finalVelocity, reason: 'Role dynamics and accent contour' });

    return {
      ...event,
      pocketTimeBeats,
      timingOffsetBeats: pocketTimeBeats - event.baseTimeBeats,
      timingOffsetMs: beatsToMs(pocketTimeBeats - event.baseTimeBeats, tempoBpm),
      finalVelocity,
      probabilityPass: probabilityPass(event, state.seed),
      pocketProfileId: profile.id,
      seed: state.seed,
      articulation,
      trace,
    };
  }).sort(comparePocketEvents);
}

export function buildPocketSchedule(pattern, pocketState = {}, context = {}) {
  const tempoBpm = clampNumber(context.tempoBpm ?? context.bpm ?? 120, 30, 300);
  const sampleRate = clampNumber(context.sampleRate ?? 48000, 1, 384000);
  const stepCount = Math.max(1, Math.floor(Number(pattern?.stepCount) || 16));
  const loopBars = Math.max(1, Math.ceil(stepCount / 16));
  const stepsPerBar = stepCount / loopBars;
  const loopBeats = beatsPerBar(context.timeSignature) * loopBars;
  const baseEvents = buildPatternEvents(pattern, {
    ...context,
    stepsPerBar,
    loopBeats,
  });
  const pocketEvents = applyPocket(baseEvents, pocketState, {
    ...context,
    tempoBpm,
    stepsPerBar,
    loopBeats,
  });
  const secondsPerBeat = 60 / tempoBpm;
  const schedule = pocketEvents.map((event) => {
    const timeFrames = Math.round(event.pocketTimeBeats * secondsPerBeat * sampleRate);
    const baseTimeFrames = Math.round(event.baseTimeBeats * secondsPerBeat * sampleRate);
    return {
      timeFrames,
      baseTimeFrames,
      trackId: event.trackId,
      role: event.role,
      sourceStep: event.sourceStep,
      velocity: clamp01(event.finalVelocity),
      probabilityPass: event.probabilityPass,
      articulation: event.articulation,
      traceId: `${event.trackId}:${event.sourceStep}:${event.pocketProfileId}:${event.seed}`,
      offsetMs: event.timingOffsetMs,
      pocketProfileId: event.pocketProfileId,
    };
  }).sort((left, right) => (
    left.timeFrames - right.timeFrames
    || (ROLE_ORDER[left.role] ?? 99) - (ROLE_ORDER[right.role] ?? 99)
    || String(left.trackId).localeCompare(String(right.trackId))
  ));
  return {
    enabled: normalizePocketState(pocketState).enabled && !normalizePocketState(pocketState).bypass,
    profileId: normalizePocketState(pocketState).profileId,
    sampleRate,
    tempoBpm,
    stepCount,
    stepsPerBar,
    loopBars,
    loopBeats,
    loopFrames: Math.max(1, Math.round(loopBeats * secondsPerBeat * sampleRate)),
    events: schedule,
    debugEvents: pocketEvents,
  };
}

export function msToBeats(ms, tempoBpm = 120) {
  return Number(ms || 0) / (60000 / clampNumber(tempoBpm, 30, 300));
}

export function beatsToMs(beats, tempoBpm = 120) {
  return Number(beats || 0) * (60000 / clampNumber(tempoBpm, 30, 300));
}

export function seededUnitValue(key, seed = 0) {
  let hash = normalizeSeed(seed) ^ 2166136261;
  const text = String(key);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 0xffffffff;
}

function probabilityPass(event, seed) {
  const probability = clamp01(event.probability ?? 1);
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return seededUnitValue(`${event.id}:probability:${event.sourceStep}:${event.role}`, seed) <= probability;
}

function seededCentered(key, seed) {
  return (seededUnitValue(key, seed) - 0.5) * 2;
}

function stepToBeats(stepIndex, stepsPerBar, timeSignature = { numerator: 4, denominator: 4 }) {
  const safeStepsPerBar = Math.max(1, Number(stepsPerBar) || 16);
  return (Number(stepIndex) / safeStepsPerBar) * beatsPerBar(timeSignature);
}

function swingOffsetMs(stepIndex, swing, stepsPerBar) {
  if (stepIndex % 2 === 0) return 0;
  const sixteenthMsAt120 = 125;
  const densityScale = 16 / Math.max(1, stepsPerBar);
  return sixteenthMsAt120 * 0.34 * clamp01(swing) * densityScale;
}

function traceTime(trace, stage, before, after, reason) {
  trace.push({ stage, valueBefore: before, valueAfter: after, reason });
  return after;
}

function comparePocketEvents(left, right) {
  return left.pocketTimeBeats - right.pocketTimeBeats
    || left.baseTimeBeats - right.baseTimeBeats
    || (ROLE_ORDER[left.role] ?? 99) - (ROLE_ORDER[right.role] ?? 99)
    || String(left.trackId).localeCompare(String(right.trackId));
}

function cycleValue(values, index, fallback) {
  if (!values?.length) return fallback;
  const safeIndex = positiveModulo(Math.floor(Number(index) || 0), values.length);
  return clampNumber(values[safeIndex], 0, 2, fallback);
}

function beatsPerBar(timeSignature = { numerator: 4, denominator: 4 }) {
  return Math.max(1, Number(timeSignature?.numerator) || 4);
}

function normalizeRole(role) {
  if (role === 'hat-closed' || role === 'closedHat' || role === 'openHat') return 'hat';
  return role || 'unknown';
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

function normalizeRuleMap(value = {}) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const [key, rule] of Object.entries(value)) {
    if (rule && typeof rule === 'object') normalized[key] = { ...rule };
  }
  return normalized;
}

function normalizeVariation(value = {}) {
  return {
    enabled: value?.enabled !== false,
    timingRangeMs: clampNumber(value?.timingRangeMs ?? 4, 0, 16),
    velocityRange: clampNumber(value?.velocityRange ?? 0.04, 0, 0.2),
    repeatability: clamp01(value?.repeatability ?? 0.8),
  };
}

function normalizeNumberArray(value, fallback, min, max) {
  if (!Array.isArray(value) || value.length === 0) return [...fallback];
  return value.map((item) => clampNumber(item, min, max, 1));
}

function normalizeSeed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1337;
  return Math.max(0, Math.floor(number)) >>> 0;
}

function positiveModulo(value, divisor) {
  const safeDivisor = Math.max(1, Number(divisor) || 1);
  return ((value % safeDivisor) + safeDivisor) % safeDivisor;
}

function clamp01(value) {
  return clampNumber(value, 0, 1);
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
