import {
  beatTrackSampleSignature,
  createBeatSonicSampleMapForPattern,
} from './beatSampleResolver.js';

const beatAudioPayloadCache = new Map();
const DEFAULT_SAMPLE_RATE = 48000;

export function resolveBeatAudioSampleRate(universalTransport) {
  const contextRate = universalTransport?.context?.sampleRate;
  return Number.isFinite(contextRate) && contextRate > 0
    ? contextRate
    : DEFAULT_SAMPLE_RATE;
}

export function buildBeatAgentAudioPayload(
  id,
  state,
  { sampleRate = DEFAULT_SAMPLE_RATE, localPreview = false } = {},
) {
  const signature = JSON.stringify({
    id,
    sampleRate,
    localPreview,
    pattern: state?.pattern,
    parameters: state?.parameters,
    muted: state?.muted,
    solo: state?.solo,
  });
  const cached = beatAudioPayloadCache.get(signature);
  if (cached) return cached;
  const payload = {
    id,
    pattern: state?.pattern ?? null,
    parameters: state?.parameters ?? {},
    gain: Number.isFinite(Number(state?.parameters?.gain)) ? Number(state.parameters.gain) : 1,
    muted: state?.muted === true,
    solo: localPreview ? true : state?.solo === true,
    sonicSamples: createBeatSonicSampleMapForPattern(state?.pattern, { sampleRate, seed: id }),
  };
  beatAudioPayloadCache.set(signature, payload);
  if (beatAudioPayloadCache.size > 16) {
    beatAudioPayloadCache.delete(beatAudioPayloadCache.keys().next().value);
  }
  return payload;
}

export function stripBeatLiveTransportState(transportState = {}) {
  const settings = { ...(transportState ?? {}) };
  delete settings.isPlaying;
  delete settings.isPaused;
  delete settings.isRecording;
  delete settings.currentBar;
  delete settings.currentBeat;
  delete settings.currentTick;
  return settings;
}

export function bindBeatRuntimeTransport(entry) {
  entry?.unsubscribeSteps?.();
  entry.unsubscribeSteps = null;
  entry.activeTransport = null;
}

export async function startBeatWorkletSession(entry, universalTransport, runtimeKey, state) {
  if (!entry || !universalTransport || !runtimeKey) return () => {};
  await universalTransport.ensureReady?.();
  entry.workletRefs = Math.max(0, entry.workletRefs ?? 0) + 1;
  entry.registeredAudioTransport = universalTransport;
  const sampleRate = resolveBeatAudioSampleRate(universalTransport);
  await universalTransport.registerBeatAgent(
    buildBeatAgentAudioPayload(runtimeKey, state, { sampleRate }),
  );
  return () => releaseBeatWorkletSession(entry, runtimeKey);
}

export async function updateBeatWorkletAgent(
  universalTransport,
  runtimeKey,
  state,
  { localPreview = false } = {},
) {
  if (!universalTransport || !runtimeKey) return;
  const sampleRate = resolveBeatAudioSampleRate(universalTransport);
  await universalTransport.updateBeatAgent(
    runtimeKey,
    buildBeatAgentAudioPayload(runtimeKey, state, { sampleRate, localPreview }),
  );
}

export function releaseBeatWorkletSession(entry, runtimeKey) {
  if (!entry || !runtimeKey) return;
  entry.workletRefs = Math.max(0, (entry.workletRefs ?? 0) - 1);
  if (entry.workletRefs === 0) {
    entry.registeredAudioTransport?.unregisterBeatAgent(runtimeKey);
    entry.registeredAudioTransport = null;
  }
}

export function applyBeatClockTransportSettings(universalTransport, transportState) {
  if (!universalTransport) return;
  universalTransport.setTransportSettings(stripBeatLiveTransportState(transportState));
}

export async function startBeatClockSync(entry, universalTransport, runtimeKey, state) {
  return startBeatWorkletSession(entry, universalTransport, runtimeKey, state);
}

export async function updateBeatClockSync(
  universalTransport,
  runtimeKey,
  state,
  options = {},
) {
  return updateBeatWorkletAgent(universalTransport, runtimeKey, state, options);
}

export function releaseBeatClockSync(entry, runtimeKey) {
  return releaseBeatWorkletSession(entry, runtimeKey);
}

export function stopLocalTransportForClockSync(_localTransport) {
  /* Local MusicTransport scheduling is no longer used for beat playback. */
}

export { beatTrackSampleSignature };
