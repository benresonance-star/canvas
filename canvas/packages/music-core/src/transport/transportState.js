export const DEFAULT_TICKS_PER_QUARTER = 960;

export function createDefaultTransportState(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'transport-default',
    projectId: overrides.projectId ?? null,
    isPlaying: false,
    isPaused: false,
    isRecording: false,
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    swing: 0,
    currentBar: 1,
    currentBeat: 1,
    currentTick: 0,
    ticksPerQuarter: DEFAULT_TICKS_PER_QUARTER,
    loopEnabled: true,
    loopStartBar: 1,
    loopEndBar: 2,
    clockSource: 'internal',
    updatedAt: now,
    ...overrides,
  };
}

export function clampBpm(value) {
  const bpm = Number(value);
  if (!Number.isFinite(bpm)) return 120;
  return Math.max(30, Math.min(300, bpm));
}

export function updateTransportState(state, patch) {
  return {
    ...state,
    ...patch,
    bpm: patch.bpm === undefined ? state.bpm : clampBpm(patch.bpm),
    timeSignature: {
      ...(state.timeSignature ?? { numerator: 4, denominator: 4 }),
      ...(patch.timeSignature ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
}
