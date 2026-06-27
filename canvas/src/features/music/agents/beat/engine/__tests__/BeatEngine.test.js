import { describe, expect, it, vi } from 'vitest';
import { BeatEngine } from '../BeatEngine.js';

describe('BeatEngine scheduling', () => {
  it('passes scheduled audio time to every triggered track step', async () => {
    const track = {
      id: 'kick',
      role: 'kick',
      muted: false,
      steps: [{ active: true, velocity: 0.8, probability: 1 }],
    };
    const engine = new BeatEngine({
      getState: () => ({
        pattern: {
          stepCount: 1,
          tracks: [track],
        },
      }),
    });
    engine.triggerTrack = vi.fn(async () => {});

    await engine.playStep(0, 12.345);

    expect(engine.triggerTrack).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ scheduledAudioTime: 12.345 }),
    );
  });

  it('converts performance-clock scheduled time to the engine audio context clock', async () => {
    const track = {
      id: 'kick',
      role: 'kick',
      muted: false,
      steps: [{ active: true, velocity: 0.8, probability: 1 }],
    };
    const engine = new BeatEngine({
      getState: () => ({
        pattern: {
          stepCount: 1,
          tracks: [track],
        },
      }),
    });
    engine.context = { currentTime: 8 };
    engine.ensureContext = vi.fn(async () => engine.context);
    engine.triggerTrack = vi.fn(async () => {});
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(5000);

    await engine.playStep(0, 5.12, { clockSource: 'performance' });

    expect(engine.triggerTrack).toHaveBeenCalledWith(track, expect.any(Object));
    expect(engine.triggerTrack.mock.calls[0][1].scheduledAudioTime).toBeCloseTo(8.12);
    nowSpy.mockRestore();
  });

  it('ramps master and temporal wet gain on stop', () => {
    const engine = new BeatEngine({ getState: () => ({}) });
    const masterGain = {
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    };
    const wetGain = {
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    };
    engine.context = { currentTime: 4.2 };
    engine.master = { gain: masterGain };
    engine.temporalWet = { gain: wetGain };

    engine.stop();

    expect(masterGain.cancelScheduledValues).toHaveBeenCalledWith(4.2);
    expect(masterGain.setTargetAtTime).toHaveBeenCalledWith(0, 4.2, 0.01);
    expect(wetGain.cancelScheduledValues).toHaveBeenCalledWith(4.2);
    expect(wetGain.setTargetAtTime).toHaveBeenCalledWith(0, 4.2, 0.01);
  });

  it('uses Sonic Core rendered samples for local unsynced playback', async () => {
    const context = createFakeAudioContext();
    const engine = new BeatEngine({
      getState: () => ({ parameters: { gain: 0.8 } }),
      getTemporalState: () => ({ wet: 0 }),
    });
    engine.context = context;
    engine.master = { gain: createFakeAudioParam(), connect: vi.fn() };
    engine.ensureContext = vi.fn(async () => context);
    engine.applyTemporalState = vi.fn();

    await engine.triggerTrack({
      id: 'kick',
      role: 'kick',
      gain: 1,
      synth: { gain: 1, attackMs: 1, decayMs: 120, pitch: 0, tone: 0.5, distortion: 0 },
    }, { velocity: 0.75, scheduledAudioTime: 2 });

    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.createdSource.start).toHaveBeenCalledWith(2);
    expect(context.createdSource.connect).toHaveBeenCalled();
  });
});

function createFakeAudioContext() {
  const context = {
    currentTime: 1,
    sampleRate: 4000,
    createGain: vi.fn(() => ({
      gain: createFakeAudioParam(),
      connect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      context.createdSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      return context.createdSource;
    }),
    createBuffer: vi.fn((channels, frames, sampleRate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      return {
        duration: frames / sampleRate,
        getChannelData: (channel) => data[channel],
      };
    }),
  };
  return context;
}

function createFakeAudioParam() {
  return {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}
