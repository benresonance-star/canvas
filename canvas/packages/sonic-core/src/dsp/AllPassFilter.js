import { clamp, sanitizeSample } from './sanitizeSample.js';

export class AllPassFilter {
  constructor({ delaySamples = 240, feedback = 0.5 } = {}) {
    this.delaySamples = Math.max(1, Math.floor(Number(delaySamples) || 1));
    this.buffer = new Float32Array(this.delaySamples);
    this.index = 0;
    this.feedback = clamp(feedback, -0.98, 0.98);
  }

  setFeedback(feedback) {
    this.feedback = clamp(feedback, -0.98, 0.98);
  }

  clear() {
    this.buffer.fill(0);
    this.index = 0;
  }

  process(input) {
    const x = sanitizeSample(input);
    const delayed = this.buffer[this.index];
    const y = sanitizeSample(-this.feedback * x + delayed);
    this.buffer[this.index] = sanitizeSample(x + this.feedback * y);
    this.index = (this.index + 1) % this.delaySamples;
    return y;
  }
}
