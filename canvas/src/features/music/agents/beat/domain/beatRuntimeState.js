import { updateTrackSynth, normalizeBeatTrack } from './beatTrackSynth.js';
import {
  createDefaultTransportState,
  updateTransportState,
  createDefaultBeatAudioRouting,
  createDefaultBeatSonicTemporalState,
  normalizeSonicTemporal,
} from '../../../../../../packages/music-core/src/index.js';
import { normalizePocketState } from './pocket/index.js';
import { normalizeGlitchState } from './glitch/index.js';

export function resolveBeatAgentId(card) {
  return card?.musicAgentId || card?.versions?.[0]?.musicAgentId || null;
}

export function toggleBeatAgentStepState(state, trackId, index) {
  const next = structuredClone(state);
  const track = next?.pattern?.tracks?.find((candidate) => candidate.id === trackId);
  const step = track?.steps?.[index];
  if (!step) {
    return { ok: false, reason: 'Step not found', state };
  }
  step.active = !step.active;
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function updateBeatTrackSynthState(state, trackId, patch) {
  const next = structuredClone(state);
  const track = next?.pattern?.tracks?.find((candidate) => candidate.id === trackId);
  if (!track) {
    return { ok: false, reason: 'Track not found', state };
  }
  track.synth = updateTrackSynth(track, patch);
  track.gain = track.synth.gain;
  next.pattern.updatedAt = new Date().toISOString();
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function updateBeatTrackSoundState(state, trackId, nextTrack) {
  const updated = structuredClone(state);
  const index = updated?.pattern?.tracks?.findIndex((candidate) => candidate.id === trackId);
  if (index < 0) {
    return { ok: false, reason: 'Track not found', state };
  }
  updated.pattern.tracks[index] = normalizeBeatTrack(nextTrack);
  updated.pattern.updatedAt = new Date().toISOString();
  updated.updatedAt = new Date().toISOString();
  return { ok: true, state: updated };
}

export function beatAgentTemporalActivePatch(state, active) {
  return {
    sonicTemporal: normalizeSonicTemporal({
      ...createDefaultBeatSonicTemporalState(state?.sonicTemporal),
      enabled: active,
    }),
    audioRouting: createDefaultBeatAudioRouting({
      ...state?.audioRouting,
      sonicTemporalBypass: !active,
    }),
  };
}

export function updateBeatAgentTemporalActiveState(state, active) {
  return updateBeatAgentAudioState(state, beatAgentTemporalActivePatch(state, active));
}

export function updateBeatAgentAudioState(state, patch = {}) {
  const next = structuredClone(state);
  if (patch.sonicTemporal !== undefined) next.sonicTemporal = patch.sonicTemporal;
  if (patch.audioRouting !== undefined) next.audioRouting = patch.audioRouting;
  if (patch.mixSettings !== undefined) next.mixSettings = patch.mixSettings;
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function updateBeatAgentPocketState(state, patch = {}) {
  const next = structuredClone(state);
  next.pocket = normalizePocketState({
    ...(next.pocket ?? {}),
    ...(patch ?? {}),
    updatedAt: new Date().toISOString(),
  });
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function updateBeatAgentGlitchState(state, patch = {}) {
  const next = structuredClone(state);
  next.glitch = normalizeGlitchState({
    ...(next.glitch ?? {}),
    ...(patch ?? {}),
    updatedAt: new Date().toISOString(),
  });
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function updateBeatTransportSettingsState(state, patch) {
  const next = structuredClone(state);
  const currentTransport = createDefaultTransportState(next.transport ?? {});
  const persistedPatch = {
    ...(patch.bpm !== undefined ? { bpm: patch.bpm } : {}),
    ...(patch.timeSignature !== undefined ? { timeSignature: patch.timeSignature } : {}),
    ...(patch.swing !== undefined ? { swing: patch.swing } : {}),
    ...(patch.loopEnabled !== undefined ? { loopEnabled: patch.loopEnabled } : {}),
    ...(patch.loopStartBar !== undefined ? { loopStartBar: patch.loopStartBar } : {}),
    ...(patch.loopEndBar !== undefined ? { loopEndBar: patch.loopEndBar } : {}),
    ...(patch.clockSource !== undefined ? { clockSource: patch.clockSource } : {}),
    ...(patch.ticksPerQuarter !== undefined ? { ticksPerQuarter: patch.ticksPerQuarter } : {}),
  };
  next.transport = updateTransportState(currentTransport, persistedPatch);
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}
