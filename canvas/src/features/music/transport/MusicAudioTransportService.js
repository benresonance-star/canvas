import {
  createDefaultTransportState,
  updateTransportState,
} from '../../../../packages/music-core/src/index.js';
import { AudioEngine } from '../kernel/audio/AudioEngine.js';
import { beatPositionFromStep } from './beatTransportMath.js';
import { BeatSonicTemporalFxChain } from '../agents/beat/domain/BeatSonicTemporalFxChain.js';
import { BeatAcousticSpaceFxChain } from '../agents/beat/domain/BeatAcousticSpaceFxChain.js';
import {
  beatAudioRoutingSignature,
  resolveBeatAudioRouting,
  resolveBeatMixSettings,
  resolveBeatSpaceRouting,
} from '../agents/beat/domain/resolveBeatAudioRouting.js';

const WORKLET_URL = '/audio-worklets/beat-agent-processor.js';

export class MusicAudioTransportService {
  constructor({ audioEngine = new AudioEngine() } = {}) {
    this.audioEngine = audioEngine;
    this.context = null;
    this.master = null;
    this.node = null;
    this.readyPromise = null;
    this.pendingMessages = [];
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
    this.fxChain = null;
    this.spaceChain = null;
    this.postFxBus = null;
    this.audioRoutingState = null;
    this.mixSettings = resolveBeatMixSettings();
  }

  async ensureReady() {
    if (this.readyPromise) {
      try {
        await this.readyPromise;
        return;
      } catch {
        this.readyPromise = null;
      }
    }
    this.readyPromise = this.initialize();
    return this.readyPromise;
  }

  prepareUserGesture() {
    const context = this.audioEngine.prepareUserGesture?.();
    if (context) this.context = context;
    return context;
  }

  getAudioContextState() {
    return this.context?.state ?? this.audioEngine.getContextState?.() ?? 'none';
  }

  async enableAudio() {
    this.prepareUserGesture();
    await this.audioEngine.resumeIfNeeded?.();
    this.context = this.audioEngine.context ?? this.context;
    await this.ensureReady();
    return this.getAudioContextState();
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
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);
    this.postFxBus = context.createGain();
    this.postFxBus.gain.value = 1;
    this.fxChain = new BeatSonicTemporalFxChain(context);
    await this.fxChain.connect(this.node, this.postFxBus);
    this.spaceChain = new BeatAcousticSpaceFxChain(context);
    await this.spaceChain.connect(this.postFxBus, this.master);
    if (this.audioRoutingState) {
      this.applyBeatAudioRouting(this.audioRoutingState);
    }
    this.flushPendingMessages();
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
    this.prepareUserGesture();
    await this.audioEngine.resumeIfNeeded?.();
    this.context = this.audioEngine.context ?? this.context;
    if (this.context?.state !== 'running') {
      throw new Error('Audio is blocked by the browser. Click Enable audio first.');
    }
    await this.ensureReady();
    const startStep = Number.isFinite(Number(startTick)) ? Number(startTick) : 0;
    await this.flushAgentsToWorklet();
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

  async flushAgentsToWorklet() {
    for (const agent of this.agents.values()) {
      await this.postAgentUpsert(agent);
    }
  }

  stop() {
    this.post({ type: 'transport.stop' });
    this.fxChain?.clearFxBuffer?.();
    this.spaceChain?.clearFxBuffer?.();
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
    this.fxChain?.clearFxBuffer?.();
    this.spaceChain?.clearFxBuffer?.();
  }

  applyBeatAudioRouting({
    sonicTemporal,
    spaceState,
    descriptorGraph,
    audioRouting,
    mixSettings,
  } = {}) {
    this.audioRoutingState = {
      sonicTemporal,
      spaceState,
      descriptorGraph,
      audioRouting,
      mixSettings: resolveBeatMixSettings(mixSettings ?? this.mixSettings),
    };
    this.mixSettings = this.audioRoutingState.mixSettings;
    const resolved = resolveBeatAudioRouting(this.audioRoutingState);
    const spaceResolved = resolveBeatSpaceRouting(this.audioRoutingState);
    this.fxChain?.applyRouting({
      ...resolved,
      mixSettings: this.mixSettings,
    });
    this.spaceChain?.applyRouting(spaceResolved);
    this.post({
      type: 'mix.settings',
      roleSendLevels: this.mixSettings.roleSendLevels,
    });
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

  async registerBeatAgent(agent) {
    if (!agent?.id) return;
    const normalized = normalizeAgent(agent);
    this.agents.set(normalized.id, normalized);
    if (this.node?.port) {
      await this.postAgentUpsert(normalized);
    }
  }

  async updateBeatAgent(id, patch = {}) {
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
      isolatedTrackId: patch.isolatedTrackId !== undefined
        ? patch.isolatedTrackId
        : current.isolatedTrackId ?? null,
    });
    this.agents.set(id, next);
    if (this.node?.port) {
      await this.postAgentUpsert(next);
    }
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

  flushPendingMessages() {
    if (!this.node?.port || this.pendingMessages.length === 0) return;
    const queued = [...this.pendingMessages];
    this.pendingMessages = [];
    for (const message of queued) {
      this.deliverMessage(message);
    }
  }

  post(message) {
    if (!this.node?.port) {
      this.pendingMessages.push(message);
      return;
    }
    this.deliverMessage(message);
  }

  deliverMessage(message) {
    if (!this.node?.port) {
      this.pendingMessages.push(message);
      return;
    }
    try {
      this.node.port.postMessage(message);
    } catch (error) {
      this.handlePostFailure(message, error);
    }
  }

  async postAgentUpsert(agent) {
    const message = { type: 'agent.upsert', agent };
    if (!this.node?.port) {
      this.pendingMessages.push(message);
      return;
    }
    try {
      this.node.port.postMessage(message);
    } catch (error) {
      await this.retryAgentUpsertPerTrack(agent, error);
    }
  }

  async retryAgentUpsertPerTrack(agent, originalError) {
    const samples = agent?.sonicSamples ?? {};
    const trackIds = Object.keys(samples);
    if (trackIds.length === 0) {
      this.deliverMessage({
        type: 'agent.upsert',
        agent: { ...agent, sonicSamples: {} },
      });
      console.warn(
        'Beat transport dropped Sonic samples for AudioWorklet compatibility.',
        originalError?.message ?? originalError,
      );
      return;
    }

    const baseAgent = { ...agent, sonicSamples: {} };
    this.deliverMessage({ type: 'agent.upsert', agent: baseAgent });

    for (const trackId of trackIds) {
      const sample = samples[trackId];
      if (!sample?.left?.length) continue;
      const patchAgent = {
        ...baseAgent,
        sonicSamples: { [trackId]: sample },
      };
      try {
        this.node.port.postMessage({ type: 'agent.upsert', agent: patchAgent });
        baseAgent.sonicSamples = {
          ...baseAgent.sonicSamples,
          [trackId]: sample,
        };
      } catch (trackError) {
        console.warn(
          `Beat transport skipped Sonic sample "${trackId}" for agent ${agent.id}.`,
          trackError?.message ?? trackError,
        );
      }
    }
  }

  handlePostFailure(message, error) {
    if (message?.agent?.sonicSamples) {
      void this.retryAgentUpsertPerTrack(message.agent, error);
      return;
    }
    if (message?.type === 'init' && Array.isArray(message.agents)) {
      this.node.port.postMessage({
        ...message,
        agents: message.agents.map((agent) => ({ ...agent, sonicSamples: {} })),
      });
      console.warn(
        'Beat transport initialized without Sonic samples for AudioWorklet compatibility.',
        error?.message ?? error,
      );
      return;
    }
    throw error;
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
    isolatedTrackId: agent.isolatedTrackId ?? null,
  };
}
