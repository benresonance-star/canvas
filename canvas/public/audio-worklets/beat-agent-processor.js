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
    this.agents.set(agent.id, {
      id: agent.id,
      pattern: agent.pattern ?? null,
      parameters: agent.parameters ?? {},
      sonicSamples: normalizeSonicSamples(agent.sonicSamples),
      muted: agent.muted === true,
      solo: agent.solo === true,
      gain: finite(agent.gain, 1),
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
      for (const track of pattern?.tracks ?? []) {
        if (track.muted) continue;
        const stepData = track.steps?.[patternStep];
        if (!stepData?.active) continue;
        if (this.random() > finite(stepData.probability, 1)) continue;
        const synth = track.synth ?? {};
        const velocity = clamp(finite(stepData.velocity, 0.8), 0, 1);
        const trackGain = clamp(finite(synth.gain, finite(track.gain, 1)), 0, 1.5);
        const agentGain = clamp(finite(agent.parameters?.gain, finite(agent.gain, 1)), 0, 1.5);
        this.voices.push(createVoice({
          agentId: agent.id,
          role: track.role ?? track.id,
          velocity,
          gain: velocity * trackGain * agentGain,
          synth,
          sample: agent.sonicSamples?.[track.id] ?? agent.sonicSamples?.[track.role],
          seed: this.random(),
        }));
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
    const output = outputs[0] ?? [];
    const left = output[0];
    const right = output[1] ?? left;
    if (!left) return true;
    left.fill(0);
    if (right !== left) right.fill(0);

    for (let index = 0; index < left.length; index += 1) {
      const frame = currentFrame + index;
      while (this.isPlaying && frame >= this.nextStepFrame) {
        this.triggerStep(this.loopedStep());
        this.absoluteStep += 1;
        this.nextStepFrame += this.stepDurationFrames();
      }
      const sample = this.renderVoices();
      left[index] = clamp(sample.left, -0.98, 0.98);
      right[index] = clamp(sample.right, -0.98, 0.98);
    }
    return true;
  }

  renderVoices() {
    let left = 0;
    let right = 0;
    const activeVoices = [];
    for (const voice of this.voices) {
      const sample = voiceSample(voice);
      left += sample.left;
      right += sample.right;
      voice.age += 1;
      if (voice.age < voice.durationFrames) activeVoices.push(voice);
    }
    this.voices = activeVoices;
    return { left, right };
  }

  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }
}

function createVoice({ agentId, role, velocity, gain, synth, sample, seed }) {
  const decayFrames = sampleRate * clamp(finite(synth.decayMs, role === 'kick' ? 220 : 140) / 1000, 0.02, 0.8);
  const sampleLength = sample?.left?.length ?? 0;
  return {
    agentId,
    role,
    age: 0,
    durationFrames: sampleLength > 0 ? sampleLength : Math.ceil(decayFrames + sampleRate * 0.04),
    decayFrames,
    gain: clamp(gain, 0, 1.5),
    tone: clamp(finite(synth.tone, 0.5), 0, 1),
    pitchRatio: 2 ** (clamp(finite(synth.pitch, 0), -24, 24) / 12),
    distortion: clamp(finite(synth.distortion, 0), 0, 1),
    phase: 0,
    sample,
    noiseState: Math.max(1, Math.floor(seed * 0x7fffffff)),
    velocity,
  };
}

function voiceSample(voice) {
  if (voice.sample?.left?.length) {
    const left = voice.sample.left[voice.age] ?? 0;
    const right = voice.sample.right?.[voice.age] ?? left;
    return {
      left: clamp(left * voice.gain, -0.98, 0.98),
      right: clamp(right * voice.gain, -0.98, 0.98),
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

function positiveModulo(value, divisor) {
  const safeDivisor = Math.max(1, Number(divisor) || 1);
  return ((value % safeDivisor) + safeDivisor) % safeDivisor;
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

registerProcessor('beat-agent-processor', BeatAgentProcessor);
