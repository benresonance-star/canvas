import { renderBeatTrackSample } from '../../../../../../packages/sonic-core/src/index.js';

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
  }

  async ensureContext() {
    if (this.context) return this.context;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('WebAudio is not available');
    this.context = new AudioContextCtor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.master.connect(this.limiter);
    this.limiter.connect(this.context.destination);
    this.ensureTemporalBus();
    void this.ensureTemporalWorklet();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
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
    this.temporalWet.connect(this.master);
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
          node.connect(this.master);
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
    const state = this.getTemporalState?.() ?? {};
    const signature = this.temporalSignature(state);
    if (signature === this.lastTemporalSignature) return;
    this.lastTemporalSignature = signature;
    const now = this.context.currentTime;
    const topology = state.topology ?? 'digital';
    const topologyGain = topology === 'freeze' ? 0.42 : topology === 'swarm' ? 0.36 : 1;
    const delaySeconds = clampNumber((state.delayMs ?? 250) / 1000, 0.02, 4);
    const feedback = clampNumber(state.feedback ?? 0.28, 0, topology === 'freeze' ? 0.9 : 0.78);
    const wet = clampNumber((state.wet ?? 0.18) * topologyGain, 0, 0.72);
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
    if (this.master) {
      const now = context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.getState()?.parameters?.gain ?? 0.8, now, 0.012);
    }
    this.applyTemporalState();
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
    const gain = context.createGain();
    const temporalSend = context.createGain();
    temporalSend.gain.value = temporalSendLevel(track, this.getTemporalState?.());
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, velocity * synthGain), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);
    gain.connect(this.connectVoiceOutput(context, this.master, distortion));
    if (this.temporalInput && temporalSend.gain.value > 0.001) {
      gain.connect(temporalSend);
      temporalSend.connect(this.temporalInput);
    }

    const sonicSample = this.getSonicSample(track);
    if (sonicSample?.left?.length) {
      const source = context.createBufferSource();
      const channelCount = sonicSample.right?.length ? 2 : 1;
      const buffer = context.createBuffer(channelCount, sonicSample.left.length, context.sampleRate);
      buffer.getChannelData(0).set(sonicSample.left);
      if (channelCount > 1) buffer.getChannelData(1).set(sonicSample.right);
      source.buffer = buffer;
      source.connect(gain);
      source.start(now);
      source.stop(now + buffer.duration + 0.02);
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
    const signature = JSON.stringify({
      id: track.id,
      role: track.role,
      gain: track.gain,
      synth: track.synth,
      sampleRate: this.context.sampleRate,
    });
    const cached = this.sonicSampleCache.get(signature);
    if (cached) return cached;
    const rendered = renderBeatTrackSample(track, {
      sampleRate: this.context.sampleRate,
      seed: hashString(signature),
    });
    this.sonicSampleCache.set(signature, rendered);
    return rendered;
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
      await this.triggerTrack(track, { ...step, scheduledAudioTime: resolvedScheduledAudioTime });
    }
  }

  stop() {
    const now = this.context?.currentTime ?? 0;
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

function temporalSendLevel(track, temporalState = {}) {
  const wet = clampNumber(temporalState?.wet ?? 0, 0, 1);
  if (wet <= 0.001) return 0;
  const base = ROLE_TEMPORAL_SEND[track.role] ?? 0.16;
  const topologyBoost = temporalState.topology === 'ping-pong' || temporalState.topology === 'diffused-delay'
    ? 1.18
    : temporalState.topology === 'freeze'
      ? 0.75
      : 1;
  return clampNumber(base * wet * topologyBoost, 0, 0.42);
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
