export const SONIC_VOICE_PARAM_CONTROLS = [
  { key: 'material.brightness', label: 'Brightness', min: 0, max: 1, step: 0.01 },
  { key: 'material.hardness', label: 'Hardness', min: 0, max: 1, step: 0.01 },
  { key: 'body.resonance', label: 'Resonance', min: 0, max: 1, step: 0.01 },
  { key: 'body.damping', label: 'Damping', min: 0, max: 1, step: 0.01 },
  { key: 'contact.friction', label: 'Friction', min: 0, max: 1, step: 0.01 },
  { key: 'output.pitchSemitones', label: 'Pitch', min: -24, max: 24, step: 0.01, isPitch: true },
  { key: 'output.gain', label: 'Gain', min: 0, max: 1.5, step: 0.01 },
];

export const PITCH_CONTROL_KEY = 'output.pitchSemitones';

export function getPitchSliderConfig(semitoneMode) {
  if (semitoneMode) {
    return { min: -24, max: 24, step: 1 };
  }
  return { min: -24, max: 24, step: 0.01 };
}

export function normalizePitchValue(value, semitoneMode) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const clamped = Math.max(-24, Math.min(24, numeric));
  return semitoneMode ? Math.round(clamped) : clamped;
}

export function formatPitchDisplay(value, semitoneMode) {
  const normalized = normalizePitchValue(value, semitoneMode);
  const prefix = normalized > 0 ? '+' : '';
  if (semitoneMode) {
    return `${prefix}${normalized} st`;
  }
  return `${prefix}${normalized.toFixed(2)} st`;
}

export function getVoiceParamPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object);
}

export function patchVoiceFromPath(path, value) {
  const parts = path.split('.');
  const output = {};
  let target = output;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target[parts[index]] = {};
    target = target[parts[index]];
  }
  target[parts.at(-1)] = Number(value);
  return output;
}

export function mergeVoicePatch(voice = {}, patch = {}) {
  const output = { ...voice };
  for (const [key, value] of Object.entries(patch ?? {})) {
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? mergeVoicePatch(output[key], value)
      : value;
  }
  return output;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
