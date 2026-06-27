import { describe, expect, it, vi } from 'vitest';
import {
  applyBeatClockTransportSettings,
  bindBeatRuntimeTransport,
  buildBeatAgentAudioPayload,
  startBeatClockSync,
  stopLocalTransportForClockSync,
  stripBeatLiveTransportState,
  updateBeatClockSync,
} from '../beatClockSync.js';
import { createDefaultBeatAgentState } from '../beatAgentState.js';

describe('beat clock sync helpers', () => {
  it('builds the universal transport payload from Beat Agent state', () => {
    const state = createDefaultBeatAgentState({
      parameters: { gain: 0.72, swing: 0.1 },
      muted: true,
      solo: false,
    });

    const payload = buildBeatAgentAudioPayload('beat-1', state);
    expect(payload).toEqual(expect.objectContaining({
      id: 'beat-1',
      pattern: state.pattern,
      parameters: { gain: 0.72, swing: 0.1 },
      gain: 0.72,
      muted: true,
      solo: false,
      sonicSamples: expect.any(Object),
    }));
    expect(payload.sonicSamples.kick.left.length).toBeGreaterThan(0);
  });

  it('keeps synced refs and unregisters only after the final release', () => {
    const entry = createSyncEntry();
    const transport = createUniversalTransport();
    const state = createDefaultBeatAgentState();

    const releaseFirst = startBeatClockSync(entry, transport, 'beat-1', state);
    const releaseSecond = startBeatClockSync(entry, transport, 'beat-1', state);

    expect(entry.syncedRefs).toBe(2);
    expect(transport.registerBeatAgent).toHaveBeenCalledTimes(2);

    releaseFirst();
    expect(entry.syncedRefs).toBe(1);
    expect(transport.unregisterBeatAgent).not.toHaveBeenCalled();

    releaseSecond();
    expect(entry.syncedRefs).toBe(0);
    expect(transport.unregisterBeatAgent).toHaveBeenCalledTimes(1);
    expect(transport.unregisterBeatAgent).toHaveBeenCalledWith('beat-1');
  });

  it('updates a registered synced agent through the universal transport', () => {
    const transport = createUniversalTransport();
    const state = createDefaultBeatAgentState({ parameters: { gain: 0.44 } });

    updateBeatClockSync(transport, 'beat-1', state);

    expect(transport.updateBeatAgent).toHaveBeenCalledWith(
      'beat-1',
      expect.objectContaining({
        id: 'beat-1',
        pattern: state.pattern,
        parameters: { gain: 0.44 },
        gain: 0.44,
        sonicSamples: expect.any(Object),
      }),
    );
  });

  it('stops local transport when sync is enabled and strips live transport fields', () => {
    const localTransport = { stop: vi.fn() };
    const universalTransport = { setTransportSettings: vi.fn() };

    stopLocalTransportForClockSync(localTransport);
    applyBeatClockTransportSettings(universalTransport, {
      bpm: 128,
      isPlaying: true,
      currentTick: 12,
      currentBeat: 4,
      loopStartBar: 2,
    });

    expect(localTransport.stop).toHaveBeenCalledTimes(1);
    expect(universalTransport.setTransportSettings).toHaveBeenCalledWith({
      bpm: 128,
      loopStartBar: 2,
    });
    expect(stripBeatLiveTransportState({ bpm: 90, isPaused: true, currentBar: 3 })).toEqual({
      bpm: 90,
    });
  });

  it('does not route synced playback through local BeatEngine step scheduling', () => {
    const unsubscribe = vi.fn();
    const transport = {
      onStep: vi.fn(() => unsubscribe),
    };
    const entry = createSyncEntry();

    bindBeatRuntimeTransport(entry, transport, { clockSync: true });

    expect(transport.onStep).not.toHaveBeenCalled();
    expect(entry.engine.playStep).not.toHaveBeenCalled();
    expect(entry.activeTransport).toBe(null);
  });

  it('routes unsynced playback through local BeatEngine step scheduling', () => {
    let stepListener = null;
    const transport = {
      onStep: vi.fn((listener) => {
        stepListener = listener;
        return vi.fn();
      }),
    };
    const entry = createSyncEntry();

    bindBeatRuntimeTransport(entry, transport, { clockSync: false });
    stepListener({ step: 3, scheduledAudioTime: 10.5 });

    expect(transport.onStep).toHaveBeenCalledTimes(1);
    expect(entry.engine.playStep).toHaveBeenCalledWith(3, 10.5);
  });
});

function createSyncEntry() {
  return {
    syncedRefs: 0,
    registeredAudioTransport: null,
    activeTransport: null,
    unsubscribeSteps: null,
    engine: {
      playStep: vi.fn(),
    },
  };
}

function createUniversalTransport() {
  return {
    registerBeatAgent: vi.fn(),
    updateBeatAgent: vi.fn(),
    unregisterBeatAgent: vi.fn(),
  };
}
