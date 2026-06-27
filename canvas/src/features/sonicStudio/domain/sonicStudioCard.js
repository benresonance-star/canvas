import {
  createDefaultPercussionKit,
  createSonicArtifact,
  createSonicEngineState,
  createSonicSavePoint,
  hashSonicSourceState,
  interpolateSonicVoice,
} from '../../../../packages/sonic-core/src/index.js';

const DEFAULT_SONIC_NAME = 'Sonic Studio';

export function createDefaultSonicStudioState(overrides = {}) {
  const kit = createDefaultPercussionKit();
  const voices = overrides.voices ?? [kit.kick, kit.snare, kit.hat, kit.cymbal];
  return createSonicEngineState({
    tempoBpm: 120,
    masterGainDb: -3,
    ...overrides,
    voices,
  });
}

export function createSonicStudioRecord({
  id = crypto.randomUUID(),
  projectId = null,
  name = DEFAULT_SONIC_NAME,
  engineState,
  renderedAssets = [],
} = {}) {
  const artifact = createSonicArtifact({
    id,
    projectId,
    name,
    engineState: engineState ?? createDefaultSonicStudioState(),
    renderedAssets,
  });
  return {
    ...artifact,
    sourceStateHash: hashSonicSourceState(artifact.engineState),
  };
}

export function sonicStudioCardFromRecord(record, position = { x: 100, y: 100 }) {
  const sonic = createSonicStudioRecord(record);
  return {
    id: `sonic-studio-${sonic.id}`,
    key: `sonic-studio__${sonic.id}`,
    prefix: 'music',
    name: sonic.name,
    type: 'sonic_studio',
    sonicStudioId: sonic.id,
    sonicStudioState: sonic.engineState,
    sonicRenderedAssets: sonic.renderedAssets,
    sonicSourceStateHash: sonic.sourceStateHash,
    projectId: sonic.projectId,
    x: position.x,
    y: position.y,
    width: 380,
    height: 280,
    pinnedVersion: 1,
    versions: [
      {
        version: 1,
        filename: `${sonic.name}.sonicstudio`,
        ext: 'sonicstudio',
        inline: true,
        artifactRef: { id: sonic.id, type: 'artifact' },
      },
    ],
  };
}

export function normalizeSonicStudioCardState(card = {}) {
  return createDefaultSonicStudioState(card.sonicStudioState ?? card.engineState);
}

export function updateSonicVoice(engineState, voiceId, patch = {}) {
  const state = createDefaultSonicStudioState(engineState);
  return {
    ...state,
    voices: state.voices.map((voice) => (
      voice.id === voiceId ? deepMerge(voice, patch) : voice
    )),
  };
}

export function loadSonicSavePoint(engineState, savePointId, targetVoiceId = null) {
  const state = createDefaultSonicStudioState(engineState);
  const savePoint = state.savePoints.find((point) => point.id === savePointId);
  if (!savePoint) return state;
  const voiceId = targetVoiceId ?? savePoint.fullState.id;
  const loadedVoice = {
    ...savePoint.fullState,
    id: voiceId,
  };
  return {
    ...state,
    voices: state.voices.map((voice) => (voice.id === voiceId ? loadedVoice : voice)),
  };
}

export function updateSonicVoiceFromSpace(engineState, voiceId, point = {}) {
  const x = normalizeSpaceAxis(point.x);
  const y = normalizeSpaceAxis(point.y);
  const gain = (x + y) / 2;
  return updateSonicVoice(engineState, voiceId, {
    material: {
      brightness: x,
      hardness: x,
    },
    body: {
      resonance: y,
      damping: y,
    },
    contact: {
      friction: x,
    },
    output: {
      gain,
    },
  });
}

export function addSonicSavePoint(engineState, voiceId, options = {}) {
  const state = createDefaultSonicStudioState(engineState);
  const voice = state.voices.find((entry) => entry.id === voiceId) ?? state.voices[0];
  if (!voice) return state;
  const savePoint = createSonicSavePoint({
    id: options.id,
    name: options.name ?? voice.name,
    voice,
    tags: options.tags ?? [voice.archetype],
    color: options.color,
    notes: options.notes,
    parentId: options.parentId,
  });
  const point = sonicSpacePointForVoice(voice);
  return {
    ...state,
    savePoints: [...state.savePoints, { ...savePoint, x: point.x, y: point.y }],
  };
}

export function morphBetweenSonicSavePoints(engineState, fromId, toId, amount = 0.5, options = {}) {
  const state = createDefaultSonicStudioState(engineState);
  const from = state.savePoints.find((point) => point.id === fromId);
  const to = state.savePoints.find((point) => point.id === toId);
  if (!from || !to) return state;
  const targetVoice = options.targetVoiceId
    ? state.voices.find((voice) => voice.id === options.targetVoiceId)
    : null;
  const morphed = {
    ...interpolateSonicVoice(from.fullState, to.fullState, amount),
    id: options.targetVoiceId ?? from.fullState.id,
    name: targetVoice?.name ?? from.fullState.name,
  };
  return {
    ...state,
    voices: [morphed, ...state.voices.filter((voice) => voice.id !== morphed.id)],
  };
}

export function buildSonicStudioCardPatch(engineState, renderedAssets = []) {
  const nextState = createDefaultSonicStudioState(engineState);
  return {
    sonicStudioState: nextState,
    sonicRenderedAssets: renderedAssets,
    sonicSourceStateHash: hashSonicSourceState(nextState),
  };
}

export function summarizeSonicVoice(voice) {
  const point = sonicSpacePointForVoice(voice);
  return {
    id: voice.id,
    name: voice.name,
    archetype: voice.archetype,
    x: point.x,
    y: point.y,
    brightness: voice.material?.brightness ?? 0,
    resonance: voice.body?.resonance ?? 0,
    gain: voice.output?.gain ?? 1,
  };
}

export function sonicSpacePointForVoice(voice = {}) {
  const brightnessGroup = averageFinite([
    voice.material?.brightness,
    voice.material?.hardness,
    voice.contact?.friction,
    voice.output?.gain,
  ]);
  const resonanceGroup = averageFinite([
    voice.body?.resonance,
    voice.body?.damping,
    voice.output?.gain,
  ]);
  return {
    x: clampSpace(brightnessGroup * 2 - 1),
    y: clampSpace(resonanceGroup * 2 - 1),
  };
}

function deepMerge(base = {}, patch = {}) {
  const output = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function clampSpace(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}

function normalizeSpaceAxis(value) {
  return (clampSpace(value) + 1) / 2;
}

function averageFinite(values) {
  const finite = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!finite.length) return 0;
  return Math.max(0, Math.min(1, finite.reduce((sum, value) => sum + value, 0) / finite.length));
}
