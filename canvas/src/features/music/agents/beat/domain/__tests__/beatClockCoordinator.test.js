import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applySyncedBeatTransportSettings,
  playAllSyncedBeatAgents,
  registerBeatClockSyncEntry,
  resetBeatClockCoordinatorForTests,
  stopSyncedBeatAgent,
} from '../beatClockCoordinator.js';

describe('beatClockCoordinator', () => {
  afterEach(() => {
    resetBeatClockCoordinatorForTests();
  });

  it('registers synced preview transports and plays them together', async () => {
    const transportA = createMockTransport();
    const transportB = createMockTransport();
    registerBeatClockSyncEntry('agent-a', { previewTransport: transportA });
    registerBeatClockSyncEntry('agent-b', { previewTransport: transportB });

    await playAllSyncedBeatAgents({ startTick: 4 });

    expect(transportA.play).toHaveBeenCalledWith({ startTick: 4 });
    expect(transportB.play).toHaveBeenCalledWith({ startTick: 4 });
  });

  it('stops only the requested synced agent', () => {
    const transportA = createMockTransport();
    const transportB = createMockTransport();
    registerBeatClockSyncEntry('agent-a', { previewTransport: transportA });
    registerBeatClockSyncEntry('agent-b', { previewTransport: transportB });

    stopSyncedBeatAgent('agent-a');

    expect(transportA.stop).toHaveBeenCalledTimes(1);
    expect(transportB.stop).not.toHaveBeenCalled();
  });

  it('mirrors transport settings to all synced preview transports', () => {
    const transportA = createMockTransport();
    const transportB = createMockTransport();
    registerBeatClockSyncEntry('agent-a', { previewTransport: transportA });
    registerBeatClockSyncEntry('agent-b', { previewTransport: transportB });

    applySyncedBeatTransportSettings({
      bpm: 128,
      isPlaying: true,
      currentTick: 8,
    });

    expect(transportA.setTransportSettings).toHaveBeenCalledWith({ bpm: 128 });
    expect(transportB.setTransportSettings).toHaveBeenCalledWith({ bpm: 128 });
  });
});

function createMockTransport() {
  return {
    prepareUserGesture: vi.fn(),
    ensureReady: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    stop: vi.fn(),
    setTransportSettings: vi.fn(),
  };
}
