export const DEFAULT_BEAT_TRACKS = [
  { id: 'kick', name: 'Kick', role: 'kick' },
  { id: 'snare', name: 'Snare', role: 'snare' },
  { id: 'hat-closed', name: 'Closed Hat', role: 'hat' },
  { id: 'clap', name: 'Clap', role: 'clap' },
];

export function createBeatStep(overrides = {}) {
  return {
    active: false,
    velocity: 0.85,
    probability: 1,
    microtimingMs: 0,
    locks: {},
    ...overrides,
  };
}

export function createBeatTrack(track, stepCount = 16) {
  return {
    id: track.id,
    name: track.name,
    role: track.role,
    muted: false,
    solo: false,
    gain: 1,
    sampleId: track.sampleId ?? track.id,
    steps: Array.from({ length: stepCount }, () => createBeatStep()),
  };
}

export function createDefaultBeatPattern(overrides = {}) {
  const stepCount = overrides.stepCount ?? 16;
  const tracks = DEFAULT_BEAT_TRACKS.map((track) => createBeatTrack(track, stepCount));
  const byId = Object.fromEntries(tracks.map((track) => [track.id, track]));
  for (const step of [0, 4, 8, 12]) byId.kick.steps[step].active = true;
  for (const step of [4, 12]) byId.snare.steps[step].active = true;
  for (let step = 0; step < stepCount; step += 2) byId['hat-closed'].steps[step].active = true;
  return {
    id: overrides.id ?? 'pattern-default',
    name: overrides.name ?? 'Default Beat',
    bars: 1,
    stepCount,
    resolution: '16n',
    swing: 0,
    tracks,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function clonePattern(pattern) {
  return JSON.parse(JSON.stringify(pattern));
}

export function toggleBeatStep(pattern, trackId, stepIndex) {
  const next = clonePattern(pattern);
  const track = next.tracks.find((candidate) => candidate.id === trackId);
  if (!track || !track.steps[stepIndex]) return next;
  track.steps[stepIndex].active = !track.steps[stepIndex].active;
  next.updatedAt = new Date().toISOString();
  return next;
}
