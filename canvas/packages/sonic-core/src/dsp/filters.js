import { clamp, sanitizeSample } from './sanitizeSample.js';

export class OnePoleFilter {
  constructor({ type = 'lowpass', sampleRate = 48000, frequencyHz = 1000 } = {}) {
    this.type = type === 'highpass' ? 'highpass' : 'lowpass';
    this.sampleRate = Math.max(1, Number(sampleRate) || 48000);
    this.z1 = 0;
    this.setFrequency(frequencyHz);
  }

  setFrequency(frequencyHz) {
    const frequency = clamp(frequencyHz, 1, this.sampleRate * 0.49);
    this.alpha = 1 - Math.exp(-2 * Math.PI * frequency / this.sampleRate);
  }

  reset(value = 0) {
    this.z1 = sanitizeSample(value);
  }

  process(input) {
    const x = sanitizeSample(input);
    this.z1 = sanitizeSample(this.z1 + this.alpha * (x - this.z1));
    return this.type === 'highpass' ? sanitizeSample(x - this.z1) : this.z1;
  }
}

export class BiquadFilter {
  constructor({ type = 'lowpass', sampleRate = 48000, frequencyHz = 1000, q = 0.707 } = {}) {
    this.sampleRate = Math.max(1, Number(sampleRate) || 48000);
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.setParams({ type, frequencyHz, q });
  }

  setParams({ type = this.type, frequencyHz = this.frequencyHz, q = this.q } = {}) {
    this.type = ['lowpass', 'highpass', 'bandpass'].includes(type) ? type : 'lowpass';
    this.frequencyHz = clamp(frequencyHz, 1, this.sampleRate * 0.49);
    this.q = clamp(q, 0.05, 30);
    const omega = 2 * Math.PI * this.frequencyHz / this.sampleRate;
    const sin = Math.sin(omega);
    const cos = Math.cos(omega);
    const alpha = sin / (2 * this.q);
    let b0;
    let b1;
    let b2;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    if (this.type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else if (this.type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    } else {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(input) {
    const x = sanitizeSample(input);
    const y = sanitizeSample(
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2,
    );
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
