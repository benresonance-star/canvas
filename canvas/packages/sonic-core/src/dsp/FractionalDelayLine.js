import { clamp, sanitizeSample } from './sanitizeSample.js';

export class FractionalDelayLine {
  constructor(maxDelaySamples = 48000) {
    this.size = Math.max(4, Math.ceil(Number(maxDelaySamples) || 4) + 4);
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
    const position = positiveModulo(this.writeIndex - delay - 1, this.size);
    const index = Math.floor(position);
    const frac = position - index;
    const y0 = this.sampleAt(index - 1);
    const y1 = this.sampleAt(index);
    const y2 = this.sampleAt(index + 1);
    const y3 = this.sampleAt(index + 2);
    return sanitizeSample(cubicInterpolate(y0, y1, y2, y3, frac));
  }

  sampleAt(index) {
    return this.buffer[positiveModulo(index, this.size)];
  }
}

function cubicInterpolate(y0, y1, y2, y3, mu) {
  const a0 = y3 - y2 - y0 + y1;
  const a1 = y0 - y1 - a0;
  const a2 = y2 - y0;
  const a3 = y1;
  return a0 * mu * mu * mu + a1 * mu * mu + a2 * mu + a3;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
