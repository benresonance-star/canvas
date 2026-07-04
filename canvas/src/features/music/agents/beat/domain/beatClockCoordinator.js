import {
  applyBeatClockTransportSettings,
  stripBeatLiveTransportState,
} from './beatClockSync.js';

const syncedRuntimeEntries = new Map();

export function registerBeatClockSyncEntry(runtimeKey, { previewTransport } = {}) {
  if (!runtimeKey || !previewTransport) return () => {};
  syncedRuntimeEntries.set(runtimeKey, { previewTransport });
  return () => syncedRuntimeEntries.delete(runtimeKey);
}

export function getSyncedBeatRuntimeKeys() {
  return [...syncedRuntimeEntries.keys()];
}

export async function playAllSyncedBeatAgents({ startTick = 0 } = {}) {
  const entries = [...syncedRuntimeEntries.values()];
  if (entries.length === 0) return;
  await Promise.all(entries.map(async ({ previewTransport }) => {
    previewTransport.prepareUserGesture?.();
    await previewTransport.ensureReady?.();
  }));
  await Promise.all(entries.map(({ previewTransport }) => previewTransport.play({ startTick })));
}

export function stopSyncedBeatAgent(runtimeKey) {
  syncedRuntimeEntries.get(runtimeKey)?.previewTransport?.stop();
}

export function applySyncedBeatTransportSettings(transportState = {}) {
  const settings = stripBeatLiveTransportState(transportState);
  for (const { previewTransport } of syncedRuntimeEntries.values()) {
    applyBeatClockTransportSettings(previewTransport, settings);
  }
}

export function resetBeatClockCoordinatorForTests() {
  syncedRuntimeEntries.clear();
}
