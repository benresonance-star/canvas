import { clamp, sanitizeSample } from './sanitizeSample.js';

export class SafetyLimiter {
  constructor({
    sampleRate = 48000,
    ceilingDb = -1,
    attackSeconds = 0.003,
    releaseSeconds = 0.12,
    softClip = true,
  } = {}) {
    this.sampleRate = Math.max(1, Number(sampleRate) || 48000);
    this.ceiling = 10 ** (ceilingDb / 20);
    this.attack = Math.exp(-1 / (Math.max(0.0001, attackSeconds) * this.sampleRate));
    this.release = Math.exp(-1 / (Math.max(0.0001, releaseSeconds) * this.sampleRate));
    this.envelope = 0;
    this.softClip = softClip;
  }

  process(input) {
    const x = sanitizeSample(input);
    const level = Math.abs(x);
    const coefficient = level > this.envelope ? this.attack : this.release;
    this.envelope = sanitizeSample(level + (this.envelope - level) * coefficient);
    const gain = this.envelope > this.ceiling ? this.ceiling / Math.max(this.envelope, 1e-9) : 1;
    let output = x * gain;
    if (this.softClip && Math.abs(output) > this.ceiling) {
      output = Math.tanh(output / this.ceiling) * this.ceiling;
    }
    return clamp(sanitizeSample(output), -this.ceiling, this.ceiling);
  }

  processBlock(block) {
    for (const channel of block ?? []) {
      for (let index = 0; index < channel.length; index += 1) {
        channel[index] = this.process(channel[index]);
      }
    }
    return block;
  }
}
