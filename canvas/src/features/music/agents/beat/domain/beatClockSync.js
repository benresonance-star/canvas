import { createBeatSonicSampleMap } from '../../../../../../packages/sonic-core/src/index.js';

const beatAudioPayloadCache = new Map();

export function buildBeatAgentAudioPayload(id, state) {
  const signature = JSON.stringify({
    id,
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
    solo: state?.solo === true,
    sonicSamples: createBeatSonicSampleMap(state?.pattern, { sampleRate: 48000, seed: id }),
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

export function bindBeatRuntimeTransport(entry, transport, { clockSync = false } = {}) {
  if (clockSync || typeof transport?.onStep !== 'function') {
    entry.unsubscribeSteps?.();
    entry.unsubscribeSteps = null;
    entry.activeTransport = null;
    return;
  }
  if (entry.activeTransport === transport && entry.unsubscribeSteps) return;
  entry.unsubscribeSteps?.();
  entry.activeTransport = transport;
  entry.unsubscribeSteps = transport.onStep(({ step, scheduledAudioTime }) => {
    void entry.engine.playStep(step, scheduledAudioTime);
  });
}

export function startBeatClockSync(entry, universalTransport, runtimeKey, state) {
  if (!entry || !universalTransport || !runtimeKey) return () => {};
  entry.syncedRefs = Math.max(0, entry.syncedRefs ?? 0) + 1;
  entry.registeredAudioTransport = universalTransport;
  universalTransport.registerBeatAgent(buildBeatAgentAudioPayload(runtimeKey, state));
  return () => releaseBeatClockSync(entry, runtimeKey);
}

export function updateBeatClockSync(universalTransport, runtimeKey, state) {
  if (!universalTransport || !runtimeKey) return;
  universalTransport.updateBeatAgent(runtimeKey, buildBeatAgentAudioPayload(runtimeKey, state));
}

export function releaseBeatClockSync(entry, runtimeKey) {
  if (!entry || !runtimeKey) return;
  entry.syncedRefs = Math.max(0, (entry.syncedRefs ?? 0) - 1);
  if (entry.syncedRefs === 0) {
    entry.registeredAudioTransport?.unregisterBeatAgent(runtimeKey);
    entry.registeredAudioTransport = null;
  }
}

export function stopLocalTransportForClockSync(localTransport) {
  localTransport?.stop?.();
}

export function applyBeatClockTransportSettings(universalTransport, transportState) {
  if (!universalTransport) return;
  universalTransport.setTransportSettings(stripBeatLiveTransportState(transportState));
}
