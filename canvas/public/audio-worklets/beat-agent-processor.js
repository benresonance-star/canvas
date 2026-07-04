/* global AudioWorkletProcessor, AudioWorkletGlobalScope, currentFrame, currentTime, registerProcessor, sampleRate */
const STEPS_PER_BAR = 16;
const TWO_PI = Math.PI * 2;

class BeatAgentProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.transport = {
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      loopEnabled: true,
      loopStartTick: 0,
      loopEndTick: STEPS_PER_BAR,
    };
    this.isPlaying = false;
    this.absoluteStep = 0;
    this.nextStepFrame = 0;
    this.agents = new Map();
    this.voices = [];
    this.seed = 0x1234abcd;
    this.mixEnvelope = 0;
    this.roleSendLevels = {
      kick: 0.08,
      snare: 0.22,
      clap: 0.26,
      hat: 0.18,
      'hat-closed': 0.18,
    };
    this.port.onmessage = (event) => this.handleMessage(event.data ?? {});
  }

  handleMessage(message) {
    try {
      if (message.type === 'init') {
        this.applyTransport(message.transport);
        for (const agent of message.agents ?? []) this.upsertAgent(agent);
        this.port.postMessage({ type: 'ready' });
        return;
      }
      if (message.type === 'transport.play') {
        this.absoluteStep = Math.max(0, Math.floor(Number(message.startTick) || 0));
        this.nextStepFrame = currentFrame + 1;
        this.isPlaying = true;
        this.postPosition();
        return;
      }
      if (message.type === 'transport.stop') {
        this.isPlaying = false;
        this.absoluteStep = 0;
        this.nextStepFrame = currentFrame;
        this.voices = [];
        this.postPosition();
        return;
      }
      if (message.type === 'transport.settings') {
        this.applyTransport(message.transport);
        return;
      }
      if (message.type === 'agent.upsert' || message.type === 'agent.patch') {
        this.upsertAgent(message.agent);
        return;
      }
      if (message.type === 'agent.remove') {
        this.agents.delete(message.id);
        this.voices = this.voices.filter((voice) => voice.agentId !== message.id);
        return;
      }
      if (message.type === 'panic') {
        this.voices = [];
      }
      if (message.type === 'mix.settings') {
        this.roleSendLevels = {
          ...this.roleSendLevels,
          ...(message.roleSendLevels ?? {}),
        };
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', reason: error?.message ?? 'Beat processor error' });
    }
  }

  applyTransport(transport = {}) {
    this.transport = {
      ...this.transport,
      ...transport,
      bpm: clamp(Number(transport.bpm ?? this.transport.bpm), 30, 300),
      timeSignature: {
        ...(this.transport.timeSignature ?? { numerator: 4, denominator: 4 }),
        ...(transport.timeSignature ?? {}),
      },
    };
  }

  upsertAgent(agent) {
    if (!agent?.id) return;
    const previous = this.agents.get(agent.id);
    this.agents.set(agent.id, {
      id: agent.id,
      pattern: agent.pattern ?? previous?.pattern ?? null,
      parameters: agent.parameters ?? previous?.parameters ?? {},
      sonicSamples: {
        ...(previous?.sonicSamples ?? {}),
        ...normalizeSonicSamples(agent.sonicSamples),
      },
      muted: agent.muted === true,
      solo: agent.solo === true,
      gain: finite(agent.gain, previous?.gain ?? 1),
      isolatedTrackId: agent.isolatedTrackId ?? previous?.isolatedTrackId ?? null,
      performanceExecution: normalizePerformanceExecution(
        agent.performanceExecution ?? previous?.performanceExecution,
      ),
    });
  }

  stepDurationFrames() {
    return sampleRate * (60 / clamp(this.transport.bpm, 30, 300)) * (4 / STEPS_PER_BAR);
  }

  loopedStep() {
    const start = Math.max(0, Math.floor(Number(this.transport.loopStartTick) || 0));
    const end = Math.max(start + 1, Math.floor(Number(this.transport.loopEndTick) || STEPS_PER_BAR));
    if (this.transport.loopEnabled === false) return this.absoluteStep;
    return start + positiveModulo(this.absoluteStep - start, end - start);
  }

  triggerStep(step) {
    const agents = [...this.agents.values()];
    const hasSolo = agents.some((agent) => agent.solo);
    for (const agent of agents) {
      if (agent.muted || (hasSolo && !agent.solo)) continue;
      const pattern = agent.pattern;
      const stepCount = Math.max(1, Math.floor(Number(pattern?.stepCount) || STEPS_PER_BAR));
      const patternStep = positiveModulo(step, stepCount);
      const isolatedTrackId = agent.isolatedTrackId ?? null;
      for (const track of pattern?.tracks ?? []) {
        if (track.muted) continue;
        if (isolatedTrackId && track.id !== isolatedTrackId) continue;
        const stepData = track.steps?.[patternStep];
        if (!stepData?.active) continue;
        const perf = agent.performanceExecution ?? NEUTRAL_PERFORMANCE;
        const passProbability = clamp(
          finite(stepData.probability, 1) + perf.stepProbabilityBias + perf.densityPressure,
          0.01,
          1,
        );
        if (this.random() > passProbability) continue;
        const synth = track.synth ?? {};
        let velocity = clamp(finite(stepData.velocity, 0.8), 0, 1);
        if (perf.velocitySpread > 0) {
          velocity = clamp(velocity * (1 + (this.random() - 0.5) * perf.velocitySpread), 0.05, 1);
        }
        const trackGain = clamp(finite(synth.gain, finite(track.gain, 1)), 0, 1.5);
        const agentGain = clamp(
          finite(agent.parameters?.gain, finite(agent.gain, 1)) * (1 + perf.masterGainBias + perf.gainTrim),
          0,
          1.5,
        );
        const sample = agent.sonicSamples?.[track.id] ?? agent.sonicSamples?.[track.role];
        const sampleMode = track.soundSource === 'sonic_voice' ? 'sonic' : 'generated';
        this.voices.push(createVoice({
          agentId: agent.id,
          role: track.role ?? track.id,
          velocity,
          gain: velocity * trackGain * agentGain,
          synth,
          sample,
          sampleMode,
          seed: this.random(),
        }));
        if (perf.tapChance > 0 && this.random() < perf.tapChance) {
          this.voices.push(createVoice({
            agentId: agent.id,
            role: track.role ?? track.id,
            velocity: clamp(velocity * 0.72, 0.05, 1),
            gain: velocity * trackGain * agentGain * 0.65,
            synth,
            sample,
            sampleMode,
            seed: this.random(),
          }));
        }
      }
    }
    this.postPosition(step);
  }

  postPosition(step = this.loopedStep()) {
    const safeStep = positiveModulo(step, STEPS_PER_BAR);
    this.port.postMessage({
      type: 'position',
      isPlaying: this.isPlaying,
      bar: Math.floor(Math.max(0, step) / STEPS_PER_BAR) + 1,
      beat: Math.floor(safeStep / 4) + 1,
      tick: safeStep,
      step: safeStep,
      audioTime: currentTime,
    });
  }

  process(_inputs, outputs) {
    const dryOutput = outputs[0] ?? [];
    const sendOutput = outputs[1] ?? dryOutput;
    const dryLeft = dryOutput[0];
    const dryRight = dryOutput[1] ?? dryLeft;
    const sendLeft = sendOutput[0] ?? dryLeft;
    const sendRight = sendOutput[1] ?? sendLeft;
    if (!dryLeft) return true;
    dryLeft.fill(0);
    if (dryRight !== dryLeft) dryRight.fill(0);
    if (sendLeft && sendLeft !== dryLeft) sendLeft.fill(0);
    if (sendRight && sendRight !== sendLeft && sendRight !== dryRight) sendRight.fill(0);

    for (let index = 0; index < dryLeft.length; index += 1) {
      const frame = currentFrame + index;
      while (this.isPlaying && frame >= this.nextStepFrame) {
        this.triggerStep(this.loopedStep());
        this.absoluteStep += 1;
        this.nextStepFrame += this.stepDurationFrames();
      }
      const sample = this.renderVoices();
      const sendLevel = clamp(sample.sendLevel ?? 0.18, 0, 1);
      const dryScale = 1 - sendLevel;
      dryLeft[index] = clamp(sample.left * dryScale, -0.98, 0.98);
      dryRight[index] = clamp(sample.right * dryScale, -0.98, 0.98);
      if (sendLeft) sendLeft[index] = clamp(sample.left * sendLevel, -0.98, 0.98);
      if (sendRight) sendRight[index] = clamp(sample.right * sendLevel, -0.98, 0.98);
    }
    return true;
  }

  renderVoices() {
    let left = 0;
    let right = 0;
    let sendLevel = 0;
    let weight = 0;
    const activeVoices = [];
    for (const voice of this.voices) {
      const sample = voiceSample(voice);
      left += sample.left;
      right += sample.right;
      const roleSend = roleTemporalSend(voice.role, this.roleSendLevels);
      sendLevel += roleSend * Math.max(Math.abs(sample.left), Math.abs(sample.right));
      weight += Math.max(Math.abs(sample.left), Math.abs(sample.right));
      voice.age += 1;
      if (voice.age < voice.durationFrames) activeVoices.push(voice);
    }
    this.voices = activeVoices;
    const limited = softLimitMix(left, right, this);
    return {
      ...limited,
      sendLevel: weight > 0.0001 ? clamp(sendLevel / weight, 0, 1) : 0.18,
    };
  }

  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }
}

function createVoice({ agentId, role, velocity, gain, synth, sample, sampleMode = 'generated', seed }) {
  const decayFrames = sampleRate * clamp(finite(synth.decayMs, role === 'kick' ? 220 : 140) / 1000, 0.02, 0.8);
  const attackFrames = sampleRate * clamp(finite(synth.attackMs, 0) / 1000, 0, 0.08);
  const pitchRatio = 2 ** (clamp(finite(synth.pitch, 0), -24, 24) / 12);
  const sampleLength = sample?.left?.length ?? 0;
  let durationFrames = Math.ceil(decayFrames + sampleRate * 0.04);
  if (sampleLength > 0) {
    durationFrames = sampleMode === 'sonic'
      ? Math.min(Math.ceil(sampleLength / Math.max(pitchRatio, 0.25)), Math.ceil(decayFrames))
      : sampleLength;
  }
  return {
    agentId,
    role,
    age: 0,
    durationFrames,
    decayFrames,
    attackFrames,
    gain: clamp(gain, 0, 1.5),
    tone: clamp(finite(synth.tone, 0.5), 0, 1),
    pitchRatio,
    distortion: clamp(finite(synth.distortion, 0), 0, 1),
    sampleMode,
    phase: 0,
    sample,
    filterState: { left: 0, right: 0 },
    readPosition: 0,
    noiseState: Math.max(1, Math.floor(seed * 0x7fffffff)),
    velocity,
  };
}

function readSampleAt(voice, position) {
  const length = voice.sample?.left?.length ?? 0;
  if (length <= 0) return { left: 0, right: 0 };
  const clamped = clamp(position, 0, Math.max(0, length - 1));
  const idx = Math.floor(clamped);
  const frac = clamped - idx;
  const left0 = voice.sample.left[idx] ?? 0;
  const left1 = voice.sample.left[idx + 1] ?? left0;
  const right0 = voice.sample.right?.[idx] ?? left0;
  const right1 = voice.sample.right?.[idx + 1] ?? right0;
  return {
    left: left0 + (left1 - left0) * frac,
    right: right0 + (right1 - right0) * frac,
  };
}

function voiceSample(voice) {
  if (voice.sample?.left?.length) {
    const remaining = voice.durationFrames - voice.age;
    const fadeFrames = Math.min(3, Math.max(0, remaining));
    const fade = fadeFrames > 0 ? fadeFrames / 3 : 1;
    if (voice.sampleMode === 'sonic') {
      voice.readPosition += voice.pitchRatio;
      let { left, right } = readSampleAt(voice, voice.readPosition);
      const toneCutoff = 0.12 + voice.tone * 0.78;
      voice.filterState.left += toneCutoff * (left - voice.filterState.left);
      voice.filterState.right += toneCutoff * (right - voice.filterState.right);
      left = voice.filterState.left;
      right = voice.filterState.right;
      const attackEnv = voice.attackFrames > 0
        ? clamp(voice.age / voice.attackFrames, 0, 1)
        : 1;
      const decayEnv = Math.exp(-voice.age / Math.max(1, voice.decayFrames));
      const env = attackEnv * decayEnv * fade;
      left = saturate(left * voice.gain * env, voice.distortion);
      right = saturate(right * voice.gain * env, voice.distortion);
      return {
        left: clamp(left, -0.98, 0.98),
        right: clamp(right, -0.98, 0.98),
      };
    }
    const left = voice.sample.left[voice.age] ?? 0;
    const right = voice.sample.right?.[voice.age] ?? left;
    return {
      left: clamp(left * voice.gain * fade, -0.98, 0.98),
      right: clamp(right * voice.gain * fade, -0.98, 0.98),
    };
  }
  const t = voice.age / sampleRate;
  const env = Math.exp(-voice.age / Math.max(1, voice.decayFrames));
  let value = 0;
  if (voice.role === 'kick') {
    const pitch = (45 + 90 * Math.exp(-t * 26)) * voice.pitchRatio;
    voice.phase += TWO_PI * pitch / sampleRate;
    value = Math.sin(voice.phase) * env;
  } else if (voice.role === 'hat') {
    const noise = nextNoise(voice);
    const bright = noise - (voice.prevNoise ?? 0);
    voice.prevNoise = noise;
    value = bright * Math.exp(-voice.age / Math.max(1, voice.decayFrames * 0.38));
  } else if (voice.role === 'clap') {
    const burst = clapEnvelope(voice.age);
    value = nextNoise(voice) * env * burst;
  } else {
    const noise = nextNoise(voice);
    const body = Math.sin(TWO_PI * (170 + voice.tone * 180) * t) * 0.18;
    value = (noise * 0.82 + body) * env;
  }
  value = saturate(value * voice.gain * 0.8, voice.distortion);
  return { left: value, right: value };
}

function clapEnvelope(age) {
  const frameMs = sampleRate / 1000;
  const first = Math.exp(-Math.max(0, age) / (frameMs * 12));
  const second = age > frameMs * 12 ? Math.exp(-(age - frameMs * 12) / (frameMs * 14)) : 0;
  const third = age > frameMs * 25 ? Math.exp(-(age - frameMs * 25) / (frameMs * 24)) : 0;
  return clamp(first + second * 0.8 + third * 0.7, 0, 1.6);
}

function nextNoise(voice) {
  voice.noiseState = (1103515245 * voice.noiseState + 12345) & 0x7fffffff;
  return (voice.noiseState / 0x3fffffff) - 1;
}

function saturate(value, amount) {
  if (amount <= 0.001) return value;
  const drive = 1 + amount * 12;
  return Math.tanh(value * drive) / Math.tanh(drive);
}

function softLimitMix(left, right, processor) {
  const peak = Math.max(Math.abs(left), Math.abs(right));
  const attack = 0.35;
  const release = 0.92;
  const ceiling = 0.85;
  const coefficient = peak > processor.mixEnvelope ? attack : release;
  processor.mixEnvelope = peak + (processor.mixEnvelope - peak) * coefficient;
  const gain = processor.mixEnvelope > ceiling
    ? ceiling / Math.max(processor.mixEnvelope, 1e-6)
    : 1;
  return {
    left: Math.tanh(left * gain),
    right: Math.tanh(right * gain),
  };
}

function positiveModulo(value, divisor) {
  const safeDivisor = Math.max(1, Number(divisor) || 1);
  return ((value % safeDivisor) + safeDivisor) % safeDivisor;
}

function roleTemporalSend(role, levels = {}) {
  if (levels[role] != null) return finite(levels[role], 0.18);
  if (role === 'kick') return finite(levels.kick, 0.08);
  if (role === 'snare') return finite(levels.snare, 0.22);
  if (role === 'clap') return finite(levels.clap, 0.26);
  if (role === 'hat' || role === 'hat-closed') return finite(levels.hat, 0.18);
  return 0.18;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function normalizeSonicSamples(samples = {}) {
  const normalized = {};
  for (const [key, sample] of Object.entries(samples ?? {})) {
    if (!sample?.left?.length) continue;
    normalized[key] = {
      left: sample.left instanceof Float32Array ? sample.left : new Float32Array(sample.left),
      right: sample.right instanceof Float32Array ? sample.right : new Float32Array(sample.right ?? sample.left),
    };
  }
  return normalized;
}

const NEUTRAL_PERFORMANCE = {
  stepProbabilityBias: 0,
  velocitySpread: 0,
  masterGainBias: 0,
  densityPressure: 0,
  tapChance: 0,
  gainTrim: 0,
};

function normalizePerformanceExecution(performance = {}) {
  return {
    stepProbabilityBias: clamp(performance.stepProbabilityBias ?? 0, -0.35, 0.35),
    velocitySpread: clamp(performance.velocitySpread ?? 0, 0, 0.45),
    masterGainBias: clamp(performance.masterGainBias ?? 0, -0.25, 0.25),
    densityPressure: clamp(performance.densityPressure ?? 0, -0.2, 0.2),
    tapChance: clamp(performance.tapChance ?? 0, 0, 0.22),
    gainTrim: clamp(performance.gainTrim ?? 0, -0.18, 0.05),
  };
}

registerProcessor('beat-agent-processor', BeatAgentProcessor);
