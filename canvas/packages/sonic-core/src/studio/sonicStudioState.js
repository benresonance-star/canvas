import { createSonicVoiceState } from '../types/models.js';
import { createTemporalState } from '../temporal/temporalState.js';

export function createSonicEngineState(overrides = {}) {
  return {
    version: overrides.version ?? '1.0.0',
    sampleRate: overrides.sampleRate ?? 48000,
    tempoBpm: overrides.tempoBpm ?? 120,
    masterGainDb: overrides.masterGainDb ?? -3,
    voices: Array.isArray(overrides.voices) ? overrides.voices.map(createSonicVoiceState) : [],
    effects: Array.isArray(overrides.effects) ? overrides.effects : [],
    modulation: overrides.modulation ?? { lanes: [] },
    temporal: createTemporalState(overrides.temporal),
    savePoints: Array.isArray(overrides.savePoints) ? overrides.savePoints : [],
    morphPaths: Array.isArray(overrides.morphPaths) ? overrides.morphPaths : [],
  };
}

export function createSonicArtifact({
  id = null,
  projectId = null,
  name = 'Sonic Studio',
  engineState = {},
  renderedAssets = [],
  version = 1,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
} = {}) {
  return {
    id,
    projectId,
    name,
    type: 'sonic_studio',
    engineState: createSonicEngineState(engineState),
    renderedAssets,
    version,
    createdAt,
    updatedAt,
  };
}

export function hashSonicSourceState(state) {
  const text = stableStringify(state);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sonic-${(hash >>> 0).toString(16)}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
