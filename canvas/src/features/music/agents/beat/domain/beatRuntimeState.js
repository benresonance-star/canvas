import { updateTrackSynth } from './beatTrackSynth.js';
import {
  createDefaultTransportState,
  updateTransportState,
} from '../../../../../../packages/music-core/src/index.js';

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
