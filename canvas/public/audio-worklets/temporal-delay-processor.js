class TemporalDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'delayMs', defaultValue: 250, minValue: 20, maxValue: 4000, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.28, minValue: 0, maxValue: 0.92, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 0.18, minValue: 0, maxValue: 0.85, automationRate: 'k-rate' },
      { name: 'diffusion', defaultValue: 0.12, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'modRateHz', defaultValue: 0.2, minValue: 0, maxValue: 12, automationRate: 'k-rate' },
      { name: 'modDepth', defaultValue: 0.08, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'drive', defaultValue: 0.05, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.35, minValue: 0, maxValue: 0.98, automationRate: 'k-rate' },
      { name: 'width', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.maxDelaySamples = Math.ceil(sampleRate * 4.2);
    this.left = new Float32Array(this.maxDelaySamples);
    this.right = new Float32Array(this.maxDelaySamples);
    this.writeIndex = 0;
    this.phase = 0;
    this.freeze = false;
    this.reverse = false;
    this.crossFeedback = 0;
    this.topology = 'digital';
    this.pitchRatio = 1;
    this.grainSamples = Math.round(sampleRate * 0.08);
    this.voices = 4;
    this.jitterSeed = 0.37;
    this.lowpassLeft = 0;
    this.lowpassRight = 0;
    this.port.onmessage = (event) => {
      const data = event.data ?? {};
      this.topology = data.topology || 'digital';
      this.freeze = data.freeze === true;
      this.reverse = data.reverse === true;
      this.crossFeedback = clamp(data.crossFeedback ?? 0, 0, 0.55);
      this.pitchRatio = clamp(data.pitchRatio ?? 1, 0.25, 4);
      this.grainSamples = clamp(data.grainSamples ?? sampleRate * 0.08, sampleRate * 0.012, sampleRate * 0.24);
      this.voices = Math.round(clamp(data.voices ?? 4, 1, 12));
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const inLeft = input[0] ?? ZERO_BLOCK;
    const inRight = input[1] ?? inLeft;
    const outLeft = output[0];
    const outRight = output[1] ?? outLeft;
    if (!outLeft) return true;

    const delayMs = param(parameters.delayMs, 0);
    const feedback = clamp(param(parameters.feedback, 0), 0, 0.92);
    const wet = clamp(param(parameters.wet, 0), 0, 0.85);
    const diffusion = clamp(param(parameters.diffusion, 0), 0, 1);
    const modRateHz = clamp(param(parameters.modRateHz, 0), 0, 12);
    const modDepth = clamp(param(parameters.modDepth, 0), 0, 1);
    const drive = clamp(param(parameters.drive, 0), 0, 1);
    const damping = clamp(param(parameters.damping, 0), 0, 0.98);
    const width = clamp(param(parameters.width, 0), 0, 1);
    const baseDelaySamples = clamp((delayMs / 1000) * sampleRate, 1, this.maxDelaySamples - 3);
    const modulationSamples = baseDelaySamples * modDepth * 0.08;
    const reverseSign = this.reverse ? -1 : 1;

    for (let i = 0; i < outLeft.length; i += 1) {
      const mod = Math.sin(this.phase) * modulationSamples;
      this.phase += (2 * Math.PI * modRateHz) / sampleRate;
      if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

      const readPosition = wrap(this.writeIndex - reverseSign * (baseDelaySamples + mod), this.maxDelaySamples);
      const topologyTap = readTopologyTaps({
        left: this.left,
        right: this.right,
        position: readPosition,
        baseDelaySamples,
        maxDelaySamples: this.maxDelaySamples,
        topology: this.topology,
        phase: this.phase,
        pitchRatio: this.pitchRatio,
        grainSamples: this.grainSamples,
        voices: this.voices,
        jitter: this.jitterSeed,
      });
      this.jitterSeed = fract(this.jitterSeed * 1.9187 + 0.173);
      const delayedLeft = topologyTap.left;
      const delayedRight = topologyTap.right;
      const diffLeft = delayedLeft * (1 - diffusion) + delayedRight * diffusion * 0.5;
      const diffRight = delayedRight * (1 - diffusion) + delayedLeft * diffusion * 0.5;
      this.lowpassLeft = this.lowpassLeft * damping + diffLeft * (1 - damping);
      this.lowpassRight = this.lowpassRight * damping + diffRight * (1 - damping);

      const inputLeft = softLimit(inLeft[i] ?? 0, drive);
      const inputRight = softLimit(inRight[i] ?? inputLeft, drive);
      const fbLeft = this.lowpassLeft * feedback + this.lowpassRight * feedback * this.crossFeedback;
      const fbRight = this.lowpassRight * feedback + this.lowpassLeft * feedback * this.crossFeedback;

      if (!this.freeze) {
        this.left[this.writeIndex] = softLimit(inputLeft + fbLeft, drive);
        this.right[this.writeIndex] = softLimit(inputRight + fbRight, drive);
        this.writeIndex = (this.writeIndex + 1) % this.maxDelaySamples;
      }

      const wetLeft = this.lowpassLeft * (1 - width * 0.35) + this.lowpassRight * width * 0.35;
      const wetRight = this.lowpassRight * (1 - width * 0.35) + this.lowpassLeft * width * 0.35;
      outLeft[i] = softClip(wetLeft * wet);
      outRight[i] = softClip(wetRight * wet);
    }
    return true;
  }
}

const ZERO_BLOCK = new Float32Array(128);

function param(values, index) {
  return values.length > 1 ? values[index] : values[0];
}

function interpolate(buffer, position) {
  const index = Math.floor(position);
  const frac = position - index;
  const next = (index + 1) % buffer.length;
  return buffer[index] * (1 - frac) + buffer[next] * frac;
}

function wrap(value, length) {
  let wrapped = value % length;
  if (wrapped < 0) wrapped += length;
  return wrapped;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function softLimit(value, drive) {
  const amount = 1 + drive * 5;
  return Math.tanh(value * amount) / Math.tanh(amount);
}

function softClip(value) {
  return Math.max(-0.98, Math.min(0.98, Math.tanh(value)));
}

function readTopologyTaps({
  left,
  right,
  position,
  baseDelaySamples,
  maxDelaySamples,
  topology,
  phase,
  pitchRatio,
  grainSamples,
  voices,
  jitter,
}) {
  if (topology === 'multi-tap') {
    return mixTaps(left, right, position, [
      [0, 0.42],
      [-baseDelaySamples * 0.25, 0.24],
      [baseDelaySamples * 0.5, 0.2],
      [-baseDelaySamples * 0.75, 0.14],
    ], maxDelaySamples);
  }
  if (topology === 'pitch-delay') {
    const pitchSweep = (fract(phase / (Math.PI * 2)) - 0.5) * baseDelaySamples * 0.2 * (pitchRatio - 1);
    return mixTaps(left, right, position, [
      [pitchSweep, 0.7],
      [pitchSweep + baseDelaySamples * 0.5 / pitchRatio, 0.3],
    ], maxDelaySamples);
  }
  if (topology === 'granular') {
    const grainPhase = fract(phase / (Math.PI * 2));
    const jitterOffset = (jitter - 0.5) * grainSamples;
    return mixTaps(left, right, position, [
      [jitterOffset, 0.42],
      [jitterOffset + grainPhase * grainSamples, 0.32],
      [jitterOffset - (1 - grainPhase) * grainSamples, 0.26],
    ], maxDelaySamples);
  }
  if (topology === 'swarm') {
    const tapList = [];
    const count = Math.max(1, Math.min(12, voices));
    for (let voice = 0; voice < count; voice += 1) {
      const spread = (voice / Math.max(1, count - 1) - 0.5) * baseDelaySamples * 0.85;
      const wobble = Math.sin(phase * (1 + voice * 0.07) + voice * 1.618) * baseDelaySamples * 0.04;
      tapList.push([spread + wobble, 1 / count]);
    }
    return mixTaps(left, right, position, tapList, maxDelaySamples);
  }
  return {
    left: interpolate(left, position),
    right: interpolate(right, position),
  };
}

function mixTaps(left, right, position, taps, maxDelaySamples) {
  let mixedLeft = 0;
  let mixedRight = 0;
  let gain = 0;
  for (const [offset, amount] of taps) {
    const tapPosition = wrap(position + offset, maxDelaySamples);
    mixedLeft += interpolate(left, tapPosition) * amount;
    mixedRight += interpolate(right, tapPosition) * amount;
    gain += amount;
  }
  const normalizer = gain > 0 ? 1 / gain : 1;
  return {
    left: mixedLeft * normalizer,
    right: mixedRight * normalizer,
  };
}

function fract(value) {
  return value - Math.floor(value);
}

registerProcessor('temporal-delay-processor', TemporalDelayProcessor);
