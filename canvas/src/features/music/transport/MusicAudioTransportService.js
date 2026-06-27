import {
  createDefaultTransportState,
  updateTransportState,
} from '../../../../packages/music-core/src/index.js';
import { AudioEngine } from '../kernel/audio/AudioEngine.js';
import { beatPositionFromStep } from './beatTransportMath.js';

const WORKLET_URL = '/audio-worklets/beat-agent-processor.js';

export class MusicAudioTransportService {
  constructor({ audioEngine = new AudioEngine() } = {}) {
    this.audioEngine = audioEngine;
    this.context = null;
    this.master = null;
    this.node = null;
    this.readyPromise = null;
    this.transportState = createDefaultTransportState();
    this.position = {
      isPlaying: false,
      bar: 1,
      beat: 1,
      tick: 0,
      step: 0,
      audioTime: 0,
    };
    this.transportListeners = new Set();
    this.positionListeners = new Set();
    this.agents = new Map();
  }

  async ensureReady() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.initialize();
    return this.readyPromise;
  }

  async initialize() {
    const context = await this.audioEngine.ensureContext();
    this.context = context;
    if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      throw new Error('AudioWorklet is not available in this browser');
    }
    await context.audioWorklet.addModule(WORKLET_URL);
    this.master = context.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(context.destination);
    this.node = new AudioWorkletNode(context, 'beat-agent-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);
    this.node.connect(this.master);
    this.post({
      type: 'init',
      transport: this.serializedTransportSettings(),
      agents: [...this.agents.values()],
    });
  }

  handleWorkletMessage(message = {}) {
    if (message.type === 'position') {
      this.position = {
        isPlaying: Boolean(message.isPlaying),
        bar: message.bar ?? 1,
        beat: message.beat ?? 1,
        tick: message.tick ?? 0,
        step: message.step ?? 0,
        audioTime: message.audioTime ?? this.context?.currentTime ?? 0,
      };
      this.transportState = {
        ...this.transportState,
        isPlaying: this.position.isPlaying,
        currentBar: this.position.bar,
        currentBeat: this.position.beat,
        currentTick: this.position.tick,
      };
      this.emitPosition();
      this.emitTransport();
      return;
    }
    if (message.type === 'error') {
      console.warn('Beat transport worklet error:', message.reason);
    }
  }

  async play({ startTick = 0 } = {}) {
    await this.ensureReady();
    if (this.context?.state === 'suspended') await this.context.resume();
    const startStep = Number.isFinite(Number(startTick)) ? Number(startTick) : 0;
    this.flushAgentsToWorklet();
    this.transportState = updateTransportState(this.transportState, {
      isPlaying: true,
      isPaused: false,
      currentTick: startStep,
      currentBeat: Math.floor((startStep % 16) / 4) + 1,
    });
    this.position = {
      ...this.position,
      ...beatPositionFromStep(startStep),
      isPlaying: true,
      audioTime: this.context?.currentTime ?? 0,
    };
    this.post({ type: 'transport.play', startTick: startStep });
    this.emitTransport();
    this.emitPosition();
  }

  flushAgentsToWorklet() {
    for (const agent of this.agents.values()) {
      this.post({ type: 'agent.upsert', agent });
    }
  }

  stop() {
    this.post({ type: 'transport.stop' });
    this.transportState = updateTransportState(this.transportState, {
      isPlaying: false,
      isPaused: false,
      currentBar: 1,
      currentBeat: 1,
      currentTick: 0,
    });
    this.position = {
      isPlaying: false,
      bar: 1,
      beat: 1,
      tick: 0,
      step: 0,
      audioTime: this.context?.currentTime ?? 0,
    };
    this.emitTransport();
    this.emitPosition();
  }

  panic() {
    this.post({ type: 'panic' });
  }

  setTransportSettings(patch = {}) {
    const settingsPatch = stripLiveTransportState(patch);
    this.transportState = updateTransportState(this.transportState, settingsPatch);
    this.post({
      type: 'transport.settings',
      transport: this.serializedTransportSettings(),
    });
    this.emitTransport();
  }

  getPosition() {
    return this.position;
  }

  subscribeTransportState(listener) {
    this.transportListeners.add(listener);
    listener(this.transportState);
    return () => this.transportListeners.delete(listener);
  }

  subscribePosition(listener) {
    this.positionListeners.add(listener);
    listener(this.position);
    return () => this.positionListeners.delete(listener);
  }

  registerBeatAgent(agent) {
    if (!agent?.id) return;
    const normalized = normalizeAgent(agent);
    this.agents.set(normalized.id, normalized);
    this.post({ type: 'agent.upsert', agent: normalized });
  }

  updateBeatAgent(id, patch = {}) {
    if (!id) return;
    const current = this.agents.get(id) ?? { id };
    const next = normalizeAgent({
      ...current,
      ...patch,
      id,
      pattern: patch.pattern ?? current.pattern,
      parameters: {
        ...(current.parameters ?? {}),
        ...(patch.parameters ?? {}),
      },
      sonicSamples: patch.sonicSamples ?? current.sonicSamples,
      gain: patch.gain ?? current.gain,
      muted: patch.muted ?? current.muted,
      solo: patch.solo ?? current.solo,
    });
    this.agents.set(id, next);
    this.post({ type: 'agent.upsert', agent: next });
  }

  unregisterBeatAgent(id) {
    if (!id) return;
    this.agents.delete(id);
    this.post({ type: 'agent.remove', id });
  }

  serializedTransportSettings() {
    const settings = stripLiveTransportState(this.transportState);
    const loopStartBar = Math.max(1, Math.floor(Number(settings.loopStartBar) || 1));
    const loopEndBar = Math.max(loopStartBar + 1, Math.floor(Number(settings.loopEndBar) || 2));
    return {
      ...settings,
      loopStartTick: settings.loopStartTick ?? (loopStartBar - 1) * 16,
      loopEndTick: settings.loopEndTick ?? (loopEndBar - 1) * 16,
    };
  }

  post(message) {
    if (!this.node?.port) return;
    try {
      this.node.port.postMessage(message);
    } catch (error) {
      if (message?.agent?.sonicSamples) {
        const fallback = {
          ...message,
          agent: {
            ...message.agent,
            sonicSamples: {},
          },
        };
        this.node.port.postMessage(fallback);
        console.warn('Beat transport dropped Sonic samples for AudioWorklet compatibility.', error);
        return;
      }
      if (message?.type === 'init' && Array.isArray(message.agents)) {
        this.node.port.postMessage({
          ...message,
          agents: message.agents.map((agent) => ({ ...agent, sonicSamples: {} })),
        });
        console.warn('Beat transport initialized without Sonic samples for AudioWorklet compatibility.', error);
        return;
      }
      throw error;
    }
  }

  emitTransport() {
    for (const listener of this.transportListeners) listener(this.transportState);
  }

  emitPosition() {
    for (const listener of this.positionListeners) listener(this.position);
  }
}

export function stripLiveTransportState(transportState = {}) {
  const settings = { ...(transportState ?? {}) };
  delete settings.isPlaying;
  delete settings.isPaused;
  delete settings.isRecording;
  delete settings.currentBar;
  delete settings.currentBeat;
  delete settings.currentTick;
  return settings;
}

function normalizeAgent(agent) {
  return {
    id: agent.id,
    pattern: agent.pattern ?? null,
    parameters: agent.parameters ?? {},
    sonicSamples: agent.sonicSamples ?? {},
    muted: Boolean(agent.muted),
    solo: Boolean(agent.solo),
    gain: Number.isFinite(Number(agent.gain)) ? Number(agent.gain) : 1,
  };
}
