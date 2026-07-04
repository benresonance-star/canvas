import { describe, expect, it, vi } from 'vitest';
import {
  applyBeatClockTransportSettings,
  bindBeatRuntimeTransport,
  buildBeatAgentAudioPayload,
  startBeatWorkletSession,
  stopLocalTransportForClockSync,
  stripBeatLiveTransportState,
  updateBeatWorkletAgent,
} from '../beatClockSync.js';
import { createDefaultBeatAgentState } from '../beatAgentState.js';

describe('beat worklet playback helpers', () => {
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

  it('forces solo for local preview when requested', () => {
    const state = createDefaultBeatAgentState({ clockSync: false, solo: false });
    const payload = buildBeatAgentAudioPayload('beat-1', state, { localPreview: true });
    expect(payload.solo).toBe(true);
  });

  it('does not force solo when local preview is inactive', () => {
    const state = createDefaultBeatAgentState({ clockSync: false, solo: false });
    const payload = buildBeatAgentAudioPayload('beat-1', state, { localPreview: false });
    expect(payload.solo).toBe(false);
  });

  it('keeps worklet refs and unregisters only after the final release', async () => {
    const entry = createSyncEntry();
    const transport = createUniversalTransport();
    const state = createDefaultBeatAgentState();

    const releaseFirst = await startBeatWorkletSession(entry, transport, 'beat-1', state);
    const releaseSecond = await startBeatWorkletSession(entry, transport, 'beat-1', state);

    expect(entry.workletRefs).toBe(2);
    expect(transport.registerBeatAgent).toHaveBeenCalledTimes(2);

    releaseFirst();
    expect(entry.workletRefs).toBe(1);
    expect(transport.unregisterBeatAgent).not.toHaveBeenCalled();

    releaseSecond();
    expect(entry.workletRefs).toBe(0);
    expect(transport.unregisterBeatAgent).toHaveBeenCalledTimes(1);
    expect(transport.unregisterBeatAgent).toHaveBeenCalledWith('beat-1');
  });

  it('updates a registered worklet agent through the universal transport', async () => {
    const transport = createUniversalTransport();
    const state = createDefaultBeatAgentState({ parameters: { gain: 0.44 } });

    await updateBeatWorkletAgent(transport, 'beat-1', state);

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

  it('strips live transport fields before applying settings', () => {
    const universalTransport = { setTransportSettings: vi.fn() };

    applyBeatClockTransportSettings(universalTransport, {
      bpm: 128,
      isPlaying: true,
      currentTick: 12,
      currentBeat: 4,
      loopStartBar: 2,
    });

    expect(universalTransport.setTransportSettings).toHaveBeenCalledWith({
      bpm: 128,
      loopStartBar: 2,
    });
    expect(stripBeatLiveTransportState({ bpm: 90, isPaused: true, currentBar: 3 })).toEqual({
      bpm: 90,
    });
    expect(stopLocalTransportForClockSync()).toBeUndefined();
  });

  it('does not route playback through BeatEngine step scheduling', () => {
    const entry = createSyncEntry();
    bindBeatRuntimeTransport(entry);
    expect(entry.engine.playStep).not.toHaveBeenCalled();
    expect(entry.activeTransport).toBe(null);
  });
});

function createSyncEntry() {
  return {
    workletRefs: 0,
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
    ensureReady: vi.fn(async () => {}),
    registerBeatAgent: vi.fn(async () => {}),
    updateBeatAgent: vi.fn(async () => {}),
    unregisterBeatAgent: vi.fn(),
  };
}
