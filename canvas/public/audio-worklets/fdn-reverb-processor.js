const FDN_DELAY_MS = [29.7, 37.1, 41.1, 53.3, 61.7, 71.9, 83.9, 97.3];
const LINE_INPUT_WEIGHTS = [1.05, 0.82, 0.95, 0.74, 0.88, 0.7, 0.8, 0.66];
const ZERO_BLOCK = new Float32Array(128);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeSample(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

function param(values, index) {
  const value = values?.[index];
  if (value === undefined) return 0;
  return typeof value === 'number' ? value : value[0] ?? 0;
}

class FractionalDelayLine {
  constructor(maxDelaySamples) {
    this.size = Math.max(8, Math.ceil(maxDelaySamples) + 4);
    this.buffer = new Float32Array(this.size);
    this.writeIndex = 0;
  }

  clear() {
    this.buffer.fill(0);
    this.writeIndex = 0;
  }

  write(sample) {
    this.buffer[this.writeIndex] = sanitizeSample(sample);
    this.writeIndex = (this.writeIndex + 1) % this.size;
  }

  read(delaySamples) {
    const delay = clamp(delaySamples, 0, this.size - 4);
    const position = ((this.writeIndex - delay - 1) % this.size + this.size) % this.size;
    const index = Math.floor(position);
    const frac = position - index;
    const y0 = this.sampleAt(index - 1);
    const y1 = this.sampleAt(index);
    const y2 = this.sampleAt(index + 1);
    const y3 = this.sampleAt(index + 2);
    const a0 = y3 - y2 - y0 + y1;
    const a1 = y0 - y1 - a0;
    const a2 = y2 - y0;
    const a3 = y1;
    return sanitizeSample(a0 * frac * frac * frac + a1 * frac * frac + a2 * frac + a3);
  }

  sampleAt(index) {
    return this.buffer[((index % this.size) + this.size) % this.size];
  }
}

class OnePoleFilter {
  constructor(frequencyHz) {
    this.z1 = 0;
    this.setFrequency(frequencyHz);
  }

  setFrequency(frequencyHz) {
    const frequency = clamp(frequencyHz, 1, sampleRate * 0.49);
    this.alpha = 1 - Math.exp((-2 * Math.PI * frequency) / sampleRate);
  }

  process(input) {
    const x = sanitizeSample(input);
    this.z1 = sanitizeSample(this.z1 + this.alpha * (x - this.z1));
    return this.z1;
  }
}

function householderMix(values, sum) {
  const output = new Float32Array(values.length);
  const scale = 2 / values.length;
  for (let index = 0; index < values.length; index += 1) {
    output[index] = sanitizeSample(values[index] - scale * sum);
  }
  return output;
}

function lineInputGain(line, inputDiffusion) {
  const uniform = 1 / LINE_INPUT_WEIGHTS.length;
  const weighted = LINE_INPUT_WEIGHTS[line] / LINE_INPUT_WEIGHTS.reduce((sum, value) => sum + value, 0);
  return (uniform + (weighted - uniform) * clamp(inputDiffusion)) * LINE_INPUT_WEIGHTS.length * 0.18;
}

class FdnReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'size', defaultValue: 0.45, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.62, minValue: 0, maxValue: 0.96, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 0.22, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.35, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'width', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'sendGain', defaultValue: 2.8, minValue: 0, maxValue: 6, automationRate: 'k-rate' },
      { name: 'delayScale', defaultValue: 1, minValue: 0.2, maxValue: 2, automationRate: 'k-rate' },
      { name: 'inputDiffusion', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'predelayMs', defaultValue: 12, minValue: 0, maxValue: 80, automationRate: 'k-rate' },
      { name: 'modDepth', defaultValue: 0.05, minValue: 0, maxValue: 0.3, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.lines = FDN_DELAY_MS.map((ms) => new FractionalDelayLine(Math.ceil((sampleRate * ms) / 1000) + 4));
    this.filters = FDN_DELAY_MS.map(() => new OnePoleFilter(5600));
    this.state = new Float32Array(this.lines.length);
    this.delaySamples = FDN_DELAY_MS.map((ms) => (sampleRate * ms) / 1000);
    this.predelay = new FractionalDelayLine(Math.ceil(sampleRate * 0.09) + 4);
    this.modPhase = 0;
    this.sendMode = false;
    this.port.onmessage = (event) => {
      const data = event.data ?? {};
      if (data.sendMode === true) this.sendMode = true;
      if (data.sendMode === false) this.sendMode = false;
      if (data.clear === true) {
        for (const line of this.lines) line.clear();
        this.predelay.clear();
        this.state.fill(0);
        for (const filter of this.filters) filter.z1 = 0;
      }
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

    const size = clamp(param(parameters.size, 0), 0, 1);
    const feedback = clamp(param(parameters.feedback, 0), 0, 0.96);
    const wet = clamp(param(parameters.wet, 0), 0, 1);
    const damping = clamp(param(parameters.damping, 0), 0, 1);
    const width = clamp(param(parameters.width, 0), 0, 1);
    const sendGain = clamp(param(parameters.sendGain, 0), 0, 6);
    const delayScale = clamp(param(parameters.delayScale, 0), 0.2, 2);
    const inputDiffusion = clamp(param(parameters.inputDiffusion, 0), 0, 1);
    const predelayMs = clamp(param(parameters.predelayMs, 0), 0, 80);
    const modDepth = clamp(param(parameters.modDepth, 0), 0, 0.3);
    const filterHz = 900 + (1 - damping) * 12000;
    const predelaySamples = (predelayMs / 1000) * sampleRate;

    for (let line = 0; line < this.filters.length; line += 1) {
      this.filters[line].setFrequency(filterHz);
    }

    for (let i = 0; i < outLeft.length; i += 1) {
      const dryLeft = inLeft[i] ?? 0;
      const dryRight = inRight[i] ?? dryLeft;
      const monoIn = (dryLeft + dryRight) * 0.5;
      this.predelay.write(monoIn);
      const diffusedIn = this.predelay.read(predelaySamples);

      this.modPhase += (2 * Math.PI * 0.17) / sampleRate;
      if (this.modPhase > Math.PI * 2) this.modPhase -= Math.PI * 2;
      const mod = Math.sin(this.modPhase) * modDepth;

      let sum = 0;
      for (let line = 0; line < this.lines.length; line += 1) {
        const baseDelay = ((sampleRate * FDN_DELAY_MS[line]) / 1000) * (0.55 + size * 1.35) * delayScale;
        const modulatedDelay = baseDelay * (1 + Math.sin(this.modPhase + line * 0.7) * mod);
        this.delaySamples[line] = modulatedDelay;
        this.state[line] = this.filters[line].process(
          this.lines[line].read(this.delaySamples[line]),
        );
        sum += this.state[line];
      }

      const mixed = householderMix(this.state, sum);
      for (let line = 0; line < this.lines.length; line += 1) {
        this.lines[line].write(diffusedIn * lineInputGain(line, inputDiffusion) + mixed[line] * feedback);
      }

      const leftWet = (this.state[0] + this.state[2] + this.state[4] + this.state[6]) * 0.25;
      const rightWet = (this.state[1] + this.state[3] + this.state[5] + this.state[7]) * 0.25;
      const midWet = (leftWet + rightWet) * 0.5;
      const sideWet = (leftWet - rightWet) * 0.5;
      const wetLeft = midWet + sideWet * width;
      const wetRight = midWet - sideWet * width;

      if (this.sendMode) {
        outLeft[i] = sanitizeSample(wetLeft * sendGain);
        outRight[i] = sanitizeSample(wetRight * sendGain);
      } else {
        const dryMix = 1 - wet;
        outLeft[i] = sanitizeSample(dryLeft * dryMix + wetLeft * wet);
        outRight[i] = sanitizeSample(dryRight * dryMix + wetRight * wet);
      }
    }

    return true;
  }
}

registerProcessor('fdn-reverb-processor', FdnReverbProcessor);
