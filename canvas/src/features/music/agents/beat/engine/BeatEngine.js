import { resolveBeatTrackSample } from '../domain/beatSampleResolver.js';

const ROLE_TEMPORAL_SEND = {
  kick: 0.08,
  snare: 0.22,
  clap: 0.26,
  hat: 0.18,
};

export class BeatEngine {
  constructor({ getState, getTemporalState = () => null }) {
    this.getState = getState;
    this.getTemporalState = getTemporalState;
    this.context = null;
    this.master = null;
    this.limiter = null;
    this.temporalInput = null;
    this.temporalDelay = null;
    this.temporalFeedback = null;
    this.temporalWet = null;
    this.temporalLowCut = null;
    this.temporalHighCut = null;
    this.temporalModOsc = null;
    this.temporalModGain = null;
    this.temporalWorklet = null;
    this.temporalWorkletReady = false;
    this.temporalWorkletFailed = false;
    this.temporalWorkletLoading = null;
    this.lastTemporalSignature = '';
    this.sonicSampleCache = new Map();
    this.masterGainTarget = null;
    this.voiceBus = null;
  }

  async ensureContext() {
    if (this.context) return this.context;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('WebAudio is not available');
    this.context = new AudioContextCtor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;
    this.voiceBus = this.context.createGain();
    this.voiceBus.gain.value = 0.72;
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.voiceBus.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.context.destination);
    this.ensureTemporalBus();
    void this.ensureTemporalWorklet();
    if (this.context.state === 'suspended') await this.context.resume();
    this.applyMasterGain(this.context);
    return this.context;
  }

  applyMasterGain(context = this.context) {
    if (!this.master || !context) return;
    const target = clampNumber(this.getState()?.parameters?.gain ?? 0.8, 0, 1.5);
    if (this.masterGainTarget === target) return;
    this.masterGainTarget = target;
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, 0.02);
  }

  currentTime() {
    return this.context?.currentTime ?? 0;
  }

  ensureTemporalBus() {
    if (!this.context || this.temporalInput) return;
    const context = this.context;
    this.temporalInput = context.createGain();
    this.temporalLowCut = context.createBiquadFilter();
    this.temporalLowCut.type = 'highpass';
    this.temporalHighCut = context.createBiquadFilter();
    this.temporalHighCut.type = 'lowpass';
    this.temporalDelay = context.createDelay(4);
    this.temporalFeedback = context.createGain();
    this.temporalWet = context.createGain();
    this.temporalModOsc = context.createOscillator();
    this.temporalModGain = context.createGain();

    this.temporalInput.connect(this.temporalLowCut);
    this.temporalLowCut.connect(this.temporalDelay);
    this.temporalDelay.connect(this.temporalHighCut);
    this.temporalHighCut.connect(this.temporalFeedback);
    this.temporalFeedback.connect(this.temporalDelay);
    this.temporalHighCut.connect(this.temporalWet);
    this.temporalWet.connect(this.voiceBus ?? this.master);
    this.temporalModOsc.connect(this.temporalModGain);
    this.temporalModGain.connect(this.temporalDelay.delayTime);
    this.temporalModOsc.start();
    this.applyTemporalState();
  }

  async ensureTemporalWorklet() {
    if (!this.context || this.temporalWorkletReady || this.temporalWorkletFailed) return;
    if (this.temporalWorkletLoading) return this.temporalWorkletLoading;
    if (!this.context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      this.temporalWorkletFailed = true;
      return;
    }
    this.temporalWorkletLoading = (async () => {
      try {
        await this.context.audioWorklet.addModule('/audio-worklets/temporal-delay-processor.js');
        const node = new AudioWorkletNode(this.context, 'temporal-delay-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        this.temporalWorklet = node;
        if (this.temporalInput) {
          try {
            this.temporalInput.disconnect(this.temporalLowCut);
          } catch {
            /* fallback graph may not be connected yet */
          }
          this.temporalInput.connect(node);
          node.connect(this.voiceBus ?? this.master);
        }
        this.temporalWorkletReady = true;
        this.lastTemporalSignature = '';
        this.applyTemporalState();
      } catch (error) {
        console.warn('Temporal AudioWorklet unavailable; using native delay fallback.', error);
        this.temporalWorkletFailed = true;
      } finally {
        this.temporalWorkletLoading = null;
      }
    })();
    return this.temporalWorkletLoading;
  }

  temporalSignature(state) {
    if (!state) return 'off';
    return [
      state.topology,
      state.delayMs,
      state.feedback,
      state.wet,
      state.diffusion,
      state.tone?.lowCutHz,
      state.tone?.highCutHz,
      state.modulation?.rateHz,
      state.modulation?.depth,
      state.character?.drive,
      state.character?.age,
      state.spatialRouting?.width,
      state.freeze?.armed,
      state.pitchSemitones,
      state.grainMs,
      state.voices,
    ].join(':');
  }

  applyTemporalState() {
    if (!this.context || (!this.temporalDelay && !this.temporalWorklet)) return;
    const state = this.getTemporalState?.() ?? null;
    if (!state) {
      this.silenceTemporalBus();
      return;
    }
    const signature = this.temporalSignature(state);
    if (signature === this.lastTemporalSignature) return;
    this.lastTemporalSignature = signature;
    const now = this.context.currentTime;
    const topology = state.topology ?? 'digital';
    const topologyGain = topology === 'freeze' ? 0.42 : topology === 'swarm' ? 0.36 : 1;
    const delaySeconds = clampNumber((state.delayMs ?? 250) / 1000, 0.02, 4);
    const feedback = clampNumber(state.feedback ?? 0.28, 0, topology === 'freeze' ? 0.9 : 0.78);
    const wet = clampNumber((state.wet ?? 0) * topologyGain, 0, 0.72);
    const drive = clampNumber(state.character?.drive ?? 0, 0, 1);
    const age = clampNumber(state.character?.age ?? 0, 0, 1);
    const diffusion = clampNumber(state.diffusion ?? 0, 0, 1);
    const modRate = clampNumber(state.modulation?.rateHz ?? 0.2, 0, 12);
    const modDepth = clampNumber(state.modulation?.depth ?? 0.08, 0, 1);
    const width = clampNumber(state.spatialRouting?.width ?? 0.5, 0, 1);
    const damping = clampNumber(0.18 + age * 0.34 + drive * 0.2, 0, 0.9);

    if (this.temporalWorkletReady && this.temporalWorklet) {
      setAudioParam(this.temporalWorklet.parameters.get('delayMs'), state.delayMs ?? 250, now);
      setAudioParam(this.temporalWorklet.parameters.get('feedback'), feedback, now);
      setAudioParam(this.temporalWorklet.parameters.get('wet'), wet, now);
      setAudioParam(this.temporalWorklet.parameters.get('diffusion'), diffusion, now);
      setAudioParam(this.temporalWorklet.parameters.get('modRateHz'), modRate, now);
      setAudioParam(this.temporalWorklet.parameters.get('modDepth'), modDepth, now);
      setAudioParam(this.temporalWorklet.parameters.get('drive'), drive, now);
      setAudioParam(this.temporalWorklet.parameters.get('damping'), damping, now);
      setAudioParam(this.temporalWorklet.parameters.get('width'), width, now);
      this.temporalWorklet.port.postMessage({
        topology,
        freeze: topology === 'freeze' && state.freeze?.armed === true,
        reverse: topology === 'reverse',
        crossFeedback: topology === 'ping-pong' || topology === 'swarm' ? 0.28 + width * 0.2 : 0,
        pitchRatio: 2 ** (clampNumber(state.pitchSemitones ?? 0, -24, 24) / 12),
        grainSamples: clampNumber(state.grainMs ?? 80, 12, 240) * this.context.sampleRate / 1000,
        voices: clampNumber(state.voices ?? 4, 1, 12),
      });
      return;
    }

    this.temporalDelay.delayTime.cancelScheduledValues(now);
    this.temporalDelay.delayTime.setTargetAtTime(delaySeconds, now, 0.025);
    this.temporalFeedback.gain.cancelScheduledValues(now);
    this.temporalFeedback.gain.setTargetAtTime(feedback, now, 0.025);
    this.temporalWet.gain.cancelScheduledValues(now);
    this.temporalWet.gain.setTargetAtTime(wet, now, 0.025);
    this.temporalLowCut.frequency.setTargetAtTime(
      clampNumber(state.tone?.lowCutHz ?? 120, 20, 1200),
      now,
      0.025,
    );
    this.temporalHighCut.frequency.setTargetAtTime(
      clampNumber((state.tone?.highCutHz ?? 9000) * (1 - drive * 0.18), 900, 20000),
      now,
      0.025,
    );
    this.temporalHighCut.Q.setTargetAtTime(0.707 + diffusion * 1.2, now, 0.025);
    this.temporalModOsc.frequency.setTargetAtTime(modRate, now, 0.05);
    this.temporalModGain.gain.setTargetAtTime(delaySeconds * modDepth * 0.08, now, 0.05);
  }

  silenceTemporalBus() {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (this.temporalWet) {
      this.temporalWet.gain.cancelScheduledValues(now);
      this.temporalWet.gain.setTargetAtTime(0, now, 0.01);
    }
    if (this.temporalFeedback) {
      this.temporalFeedback.gain.cancelScheduledValues(now);
      this.temporalFeedback.gain.setTargetAtTime(0, now, 0.01);
    }
    if (this.temporalWorklet) {
      setAudioParam(this.temporalWorklet.parameters.get('wet'), 0, now);
      setAudioParam(this.temporalWorklet.parameters.get('feedback'), 0, now);
    }
    this.lastTemporalSignature = 'off';
  }

  createDistortionCurve(amount = 0) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = 1 + amount * 40;
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1;
      curve[index] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
    }
    return curve;
  }

  connectVoiceOutput(context, destination, distortion = 0) {
    if (distortion <= 0.001) return destination;
    const shaper = context.createWaveShaper();
    shaper.curve = this.createDistortionCurve(distortion);
    shaper.oversample = '2x';
    shaper.connect(destination);
    return shaper;
  }

  async triggerTrack(track, step) {
    const context = await this.ensureContext();
    this.applyMasterGain(context);
    const scheduledTime = step.scheduledAudioTime != null
      && Number.isFinite(Number(step.scheduledAudioTime))
      ? Number(step.scheduledAudioTime)
      : context.currentTime;
    const microtiming = Math.max(-0.03, Math.min(0.03, (step.microtimingMs ?? 0) / 1000));
    const now = Math.max(context.currentTime + 0.002, scheduledTime + microtiming);
    const velocity = Math.max(0, Math.min(1, step.velocity ?? 0.8));
    const synth = track.synth ?? {};
    const synthGain = Math.max(0, Math.min(1.5, synth.gain ?? track.gain ?? 1));
    const attack = Math.max(0.001, Math.min(0.08, (synth.attackMs ?? 1) / 1000));
    const decay = Math.max(0.02, Math.min(0.8, (synth.decayMs ?? 180) / 1000));
    const pitchRatio = 2 ** (Math.max(-24, Math.min(24, synth.pitch ?? 0)) / 12);
    const tone = Math.max(0, Math.min(1, synth.tone ?? 0.5));
    const distortion = Math.max(0, Math.min(1, synth.distortion ?? 0));
    const voiceOutput = this.voiceBus ?? this.master;
    const gain = context.createGain();
    const temporalSend = context.createGain();
    temporalSend.gain.value = temporalSendLevel(track, this.getTemporalState?.());
    const peakGain = Math.max(0.001, velocity * synthGain * roleVoiceHeadroom(track.role));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + Math.max(attack, 0.003));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    gain.connect(this.connectVoiceOutput(context, voiceOutput, distortion));
    if (this.temporalInput && temporalSend.gain.value > 0.001) {
      gain.connect(temporalSend);
      temporalSend.connect(this.temporalInput);
    }

    const sonicSample = this.getSonicSample(track);
    if (sonicSample?.audioBuffer) {
      const source = context.createBufferSource();
      source.buffer = sonicSample.audioBuffer;
      source.connect(gain);
      const stopAt = now + Math.min(
        sonicSample.audioBuffer.duration,
        attack + decay + 0.015,
      );
      const fadeStart = Math.max(now + 0.003, stopAt - 0.008);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.003);
      gain.gain.setValueAtTime(peakGain, fadeStart);
      gain.gain.linearRampToValueAtTime(0.0001, stopAt);
      source.start(now);
      source.stop(stopAt + 0.016);
      return;
    }

    if (track.role === 'kick') {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130 * pitchRatio, now);
      osc.frequency.exponentialRampToValueAtTime(45 * pitchRatio, now + Math.min(0.22, attack + decay));
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + attack + decay + 0.02);
      return;
    }

    const noise = context.createBufferSource();
    const noiseDuration = Math.max(0.06, attack + decay + 0.02);
    const buffer = context.createBuffer(1, context.sampleRate * noiseDuration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    noise.playbackRate.value = pitchRatio;
    const filter = context.createBiquadFilter();
    filter.type = track.role === 'hat' ? 'highpass' : 'bandpass';
    const baseFrequency = track.role === 'hat'
      ? 4000 + tone * 8000
      : 700 + tone * 4200;
    filter.frequency.value = Math.max(80, baseFrequency * pitchRatio);
    filter.Q.value = track.role === 'hat' ? 0.7 : 1.8;
    noise.connect(filter);
    filter.connect(gain);
    noise.start(now);
    noise.stop(now + noiseDuration);
  }

  getSonicSample(track) {
    if (!this.context || !track) return null;
    const sampleRate = this.context.sampleRate;
    const signature = JSON.stringify({
      id: track.id,
      role: track.role,
      gain: track.gain,
      synth: track.synth,
      sampleRate,
    });
    const cached = this.sonicSampleCache.get(signature);
    if (cached) return cached;
    const rendered = resolveBeatTrackSample(track, {
      sampleRate,
      seed: hashString(signature),
    });
    const channelCount = rendered.right?.length ? 2 : 1;
    const audioBuffer = this.context.createBuffer(
      channelCount,
      rendered.left.length,
      sampleRate,
    );
    audioBuffer.getChannelData(0).set(rendered.left);
    if (channelCount > 1) audioBuffer.getChannelData(1).set(rendered.right);
    softenSampleEdges(audioBuffer, sampleRate);
    const entry = {
      ...rendered,
      audioBuffer,
    };
    this.sonicSampleCache.set(signature, entry);
    return entry;
  }

  async scheduledAudioTimeFromClock(scheduledTime, clockSource = 'audio') {
    const value = Number(scheduledTime);
    if (!Number.isFinite(value)) return null;
    if (clockSource !== 'performance') return value;
    const context = await this.ensureContext();
    const performanceNowSeconds = performance.now() / 1000;
    return context.currentTime + Math.max(0, value - performanceNowSeconds);
  }

  async playStep(stepIndex, scheduledAudioTime = null, options = {}) {
    const state = this.getState();
    const pattern = state?.pattern;
    if (!pattern?.tracks) return;
    const resolvedScheduledAudioTime = await this.scheduledAudioTimeFromClock(
      scheduledAudioTime,
      options.clockSource,
    );
    for (const track of pattern.tracks) {
      if (track.muted) continue;
      const step = track.steps[stepIndex % pattern.stepCount];
      if (!step?.active) continue;
      if (Math.random() > (step.probability ?? 1)) continue;
      void this.triggerTrack(track, { ...step, scheduledAudioTime: resolvedScheduledAudioTime });
    }
  }

  stop() {
    const now = this.context?.currentTime ?? 0;
    this.masterGainTarget = null;
    if (this.master) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.01);
    }
    if (this.temporalWet) {
      this.temporalWet.gain.cancelScheduledValues(now);
      this.temporalWet.gain.setTargetAtTime(0, now, 0.01);
    }
    if (this.temporalWorklet) {
      setAudioParam(this.temporalWorklet.parameters.get('wet'), 0, now);
    }
    this.lastTemporalSignature = '';
  }
}

function roleVoiceHeadroom(role) {
  if (role === 'hat') return 0.62;
  if (role === 'clap') return 0.78;
  if (role === 'snare') return 0.82;
  return 0.9;
}

function softenSampleEdges(audioBuffer, sampleRate) {
  const fadeInFrames = Math.min(
    audioBuffer.length,
    Math.max(1, Math.ceil(sampleRate * 0.004)),
  );
  const fadeOutFrames = Math.min(
    audioBuffer.length,
    Math.max(1, Math.ceil(sampleRate * 0.01)),
  );
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < fadeInFrames; index += 1) {
      data[index] *= index / fadeInFrames;
    }
    for (let index = 0; index < fadeOutFrames; index += 1) {
      const sampleIndex = data.length - fadeOutFrames + index;
      data[sampleIndex] *= (fadeOutFrames - index) / fadeOutFrames;
    }
  }
}

function temporalSendLevel(track, temporalState = null) {
  if (!temporalState) return 0;
  const wet = clampNumber(temporalState.wet ?? 0, 0, 1);
  if (wet <= 0.001) return 0;
  const base = ROLE_TEMPORAL_SEND[track.role] ?? 0.16;
  const topologyBoost = temporalState.topology === 'ping-pong' || temporalState.topology === 'diffused-delay'
    ? 1.18
    : temporalState.topology === 'freeze'
      ? 0.75
      : 1;
  return clampNumber(base * wet * topologyBoost, 0, 0.32);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.max(min, Math.min(max, Number(value)));
}

function setAudioParam(param, value, now) {
  if (!param) return;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, 0.025);
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
