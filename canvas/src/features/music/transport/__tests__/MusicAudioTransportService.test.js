import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicAudioTransportService, stripLiveTransportState } from '../MusicAudioTransportService.js';
import {
  beatPositionFromStep,
  stepDurationFramesForBpm,
  stepDurationSecondsForBpm,
} from '../beatTransportMath.js';

class FakeAudioWorkletNode {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage: vi.fn(),
    };
    this.connect = vi.fn();
  }
}

describe('beat transport math', () => {
  it('derives even sixteenth-note spacing from bpm and sample rate', () => {
    expect(stepDurationSecondsForBpm(120)).toBeCloseTo(0.125);
    expect(stepDurationFramesForBpm(120, 48000)).toBeCloseTo(6000);
  });

  it('maps steps to bar beat tick positions', () => {
    expect(beatPositionFromStep(0)).toMatchObject({ bar: 1, beat: 1, tick: 0, step: 0 });
    expect(beatPositionFromStep(7)).toMatchObject({ bar: 1, beat: 2, tick: 7, step: 7 });
    expect(beatPositionFromStep(16)).toMatchObject({ bar: 2, beat: 1, tick: 0, step: 0 });
  });
});

describe('MusicAudioTransportService', () => {
  let originalAudioWorkletNode;

  beforeEach(() => {
    originalAudioWorkletNode = globalThis.AudioWorkletNode;
    globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  });

  afterEach(() => {
    globalThis.AudioWorkletNode = originalAudioWorkletNode;
  });

  it('stores agents lazily and initializes worklet on ensureReady', async () => {
    const context = createFakeContext();
    const service = new MusicAudioTransportService({
      audioEngine: createTestAudioEngine(context),
    });

    await service.registerBeatAgent({ id: 'beat-1', pattern: { stepCount: 16, tracks: [] } });
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled();

    await service.ensureReady();

    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('/audio-worklets/beat-agent-processor.js');
    expect(service.node.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'init',
      agents: [expect.objectContaining({ id: 'beat-1' })],
    }));
  });

  it('posts an agent upsert when registering after initialization', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();
    service.node.port.postMessage.mockClear();

    await service.registerBeatAgent({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [] },
      parameters: { gain: 0.7 },
    });

    expect(service.agents.get('beat-1')).toEqual(expect.objectContaining({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [] },
      parameters: { gain: 0.7 },
      gain: 1,
    }));
    expect(service.node.port.postMessage).toHaveBeenCalledWith({
      type: 'agent.upsert',
      agent: expect.objectContaining({
        id: 'beat-1',
        pattern: { stepCount: 16, tracks: [] },
        parameters: { gain: 0.7 },
      }),
    });
  });

  it('updates an existing synced agent without dropping pattern or parameters', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();
    await service.registerBeatAgent({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [{ id: 'kick' }] },
      parameters: { gain: 0.7, swing: 0.1 },
      gain: 0.7,
    });
    service.node.port.postMessage.mockClear();

    await service.updateBeatAgent('beat-1', {
      parameters: { gain: 0.55 },
      muted: true,
    });

    expect(service.agents.get('beat-1')).toEqual(expect.objectContaining({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [{ id: 'kick' }] },
      parameters: { gain: 0.55, swing: 0.1 },
      gain: 0.7,
      muted: true,
    }));
    expect(service.node.port.postMessage).toHaveBeenCalledWith({
      type: 'agent.upsert',
      agent: expect.objectContaining({
        id: 'beat-1',
        pattern: { stepCount: 16, tracks: [{ id: 'kick' }] },
        parameters: { gain: 0.55, swing: 0.1 },
        muted: true,
      }),
    });
  });

  it('preserves rendered Sonic samples when normalizing synced agents', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();
    const sonicSamples = {
      kick: {
        left: new Float32Array([0, 0.5, 0]),
        right: new Float32Array([0, 0.4, 0]),
      },
    };

    await service.registerBeatAgent({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [] },
      sonicSamples,
    });

    expect(service.agents.get('beat-1').sonicSamples).toBe(sonicSamples);
    expect(service.node.port.postMessage).toHaveBeenLastCalledWith({
      type: 'agent.upsert',
      agent: expect.objectContaining({ sonicSamples }),
    });
  });


  it('unregisters an agent and posts removal to the worklet', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();
    await service.registerBeatAgent({ id: 'beat-1', pattern: { stepCount: 16, tracks: [] } });
    service.node.port.postMessage.mockClear();

    service.unregisterBeatAgent('beat-1');

    expect(service.agents.has('beat-1')).toBe(false);
    expect(service.node.port.postMessage).toHaveBeenCalledWith({
      type: 'agent.remove',
      id: 'beat-1',
    });
  });

  it('posts transport play after ensuring the universal transport is ready', async () => {
    const context = createFakeContext();
    const service = new MusicAudioTransportService({ audioEngine: createTestAudioEngine(context) });

    await service.play({ startTick: 6 });

    expect(context.audioWorklet.addModule).toHaveBeenCalled();
    expect(service.node.port.postMessage).toHaveBeenCalledWith({
      type: 'transport.play',
      startTick: 6,
    });
    expect(service.transportState.isPlaying).toBe(true);
    expect(service.transportState.currentTick).toBe(6);
  });

  it('flushes registered agents before posting transport play', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();
    await service.registerBeatAgent({
      id: 'beat-1',
      pattern: { stepCount: 16, tracks: [{ id: 'kick' }] },
      sonicSamples: {
        kick: {
          left: new Float32Array([0, 0.5, 0]),
          right: new Float32Array([0, 0.5, 0]),
        },
      },
    });
    service.node.port.postMessage.mockClear();

    await service.play({ startTick: 0 });

    expect(service.node.port.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'agent.upsert',
      agent: expect.objectContaining({
        id: 'beat-1',
        pattern: { stepCount: 16, tracks: [{ id: 'kick' }] },
        sonicSamples: expect.objectContaining({
          kick: expect.objectContaining({
            left: expect.any(Float32Array),
            right: expect.any(Float32Array),
          }),
        }),
      }),
    });
    expect(service.node.port.postMessage).toHaveBeenNthCalledWith(2, {
      type: 'transport.play',
      startTick: 0,
    });
  });

  it('strips live state and derives loop ticks for worklet settings', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    await service.ensureReady();

    service.setTransportSettings({
      bpm: 96,
      isPlaying: true,
      currentTick: 12,
      loopStartBar: 2,
      loopEndBar: 4,
    });

    expect(stripLiveTransportState({ isPlaying: true, currentTick: 5, bpm: 90 })).toEqual({ bpm: 90 });
    expect(service.node.port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'transport.settings',
      transport: expect.objectContaining({
        bpm: 96,
        loopStartTick: 16,
        loopEndTick: 48,
      }),
    }));
  });

  it('updates position from worklet messages without requiring main-thread note triggers', async () => {
    const service = new MusicAudioTransportService({
      audioEngine: { ensureContext: vi.fn(async () => createFakeContext()) },
    });
    const positions = [];
    service.subscribePosition((position) => positions.push(position));
    await service.ensureReady();

    service.handleWorkletMessage({
      type: 'position',
      isPlaying: true,
      bar: 2,
      beat: 3,
      tick: 10,
      step: 10,
      audioTime: 1.5,
    });

    expect(positions.at(-1)).toMatchObject({
      isPlaying: true,
      bar: 2,
      beat: 3,
      tick: 10,
      step: 10,
    });
    expect(service.transportState.currentTick).toBe(10);
  });
});

function createTestAudioEngine(context) {
  return {
    context,
    ensureContext: vi.fn(async () => context),
    resumeIfNeeded: vi.fn(async () => context),
    prepareUserGesture: vi.fn(() => context),
    getContextState: vi.fn(() => context.state),
  };
}

function createFakeContext() {
  const createGain = vi.fn(() => ({
    gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createFilter = vi.fn(() => ({
    type: 'highpass',
    frequency: { setTargetAtTime: vi.fn(), value: 120 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createCompressor = vi.fn(() => ({
    threshold: { value: -8 },
    knee: { value: 6 },
    ratio: { value: 12 },
    attack: { value: 0.002 },
    release: { value: 0.06 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  return {
    state: 'running',
    currentTime: 0,
    audioWorklet: {
      addModule: vi.fn(async () => {}),
    },
    createGain,
    createBiquadFilter: createFilter,
    createDynamicsCompressor: createCompressor,
    destination: {},
  };
}
