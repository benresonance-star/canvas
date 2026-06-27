export const BEAT_TRACK_SYNTH_RANGES = {
  gain: { min: 0, max: 1.5 },
  attackMs: { min: 0, max: 80 },
  decayMs: { min: 20, max: 800 },
  pitch: { min: -24, max: 24 },
  tone: { min: 0, max: 1 },
  distortion: { min: 0, max: 1 },
};

const ROLE_DEFAULTS = {
  kick: {
    gain: 1,
    attackMs: 1,
    decayMs: 180,
    pitch: 0,
    tone: 0.55,
    distortion: 0.12,
  },
  snare: {
    gain: 0.9,
    attackMs: 2,
    decayMs: 160,
    pitch: 0,
    tone: 0.52,
    distortion: 0.08,
  },
  hat: {
    gain: 0.55,
    attackMs: 0,
    decayMs: 70,
    pitch: 0,
    tone: 0.82,
    distortion: 0.03,
  },
  clap: {
    gain: 0.75,
    attackMs: 3,
    decayMs: 150,
    pitch: 0,
    tone: 0.46,
    distortion: 0.1,
  },
};

function clampNumber(value, { min, max }, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function createDefaultTrackSynth(role = 'drum') {
  return {
    ...(ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.clap),
  };
}

export function normalizeBeatTrackSynth(track) {
  const defaults = createDefaultTrackSynth(track?.role);
  const source = track?.synth ?? {};
  return Object.fromEntries(
    Object.entries(BEAT_TRACK_SYNTH_RANGES).map(([key, range]) => [
      key,
      clampNumber(source[key], range, defaults[key]),
    ]),
  );
}

export function normalizeBeatTrack(track) {
  return {
    ...track,
    gain: Number.isFinite(Number(track?.gain))
      ? Math.max(0, Math.min(1.5, Number(track.gain)))
      : normalizeBeatTrackSynth(track).gain,
    synth: normalizeBeatTrackSynth(track),
  };
}

export function normalizeBeatPatternSynth(pattern) {
  if (!pattern?.tracks) return pattern;
  return {
    ...pattern,
    tracks: pattern.tracks.map(normalizeBeatTrack),
  };
}

export function updateTrackSynth(track, patch) {
  const current = normalizeBeatTrackSynth(track);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch ?? {})) {
    const range = BEAT_TRACK_SYNTH_RANGES[key];
    if (!range) continue;
    next[key] = clampNumber(value, range, current[key]);
  }
  return next;
}
