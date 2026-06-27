import { sanitizeSample } from './sanitizeSample.js';

export class ParameterSmoother {
  constructor({
    initialValue = 0,
    sampleRate = 48000,
    timeSeconds = 0.01,
    mode = 'one-pole',
  } = {}) {
    this.sampleRate = Math.max(1, Number(sampleRate) || 48000);
    this.timeSeconds = Math.max(0, Number(timeSeconds) || 0);
    this.mode = mode === 'linear' ? 'linear' : 'one-pole';
    this.value = sanitizeSample(Number(initialValue) || 0);
    this.target = this.value;
    this.remaining = 0;
    this.step = 0;
    this.updateCoefficient();
  }

  updateCoefficient() {
    if (this.timeSeconds <= 0) {
      this.coefficient = 0;
    } else {
      this.coefficient = Math.exp(-1 / (this.timeSeconds * this.sampleRate));
    }
  }

  reset(value = 0) {
    this.value = sanitizeSample(Number(value) || 0);
    this.target = this.value;
    this.remaining = 0;
    this.step = 0;
  }

  setTarget(value) {
    this.target = sanitizeSample(Number(value) || 0);
    if (this.mode === 'linear') {
      this.remaining = Math.max(1, Math.round(this.timeSeconds * this.sampleRate));
      this.step = (this.target - this.value) / this.remaining;
    }
  }

  next() {
    if (this.mode === 'linear') {
      if (this.remaining <= 0) return this.target;
      this.value = sanitizeSample(this.value + this.step);
      this.remaining -= 1;
      if (this.remaining <= 0) this.value = this.target;
      return this.value;
    }
    this.value = sanitizeSample(this.target + (this.value - this.target) * this.coefficient);
    if (Math.abs(this.value - this.target) < 1e-9) this.value = this.target;
    return this.value;
  }
}
