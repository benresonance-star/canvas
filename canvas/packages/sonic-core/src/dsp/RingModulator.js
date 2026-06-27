import { clamp, sanitizeSample } from './sanitizeSample.js';
import { createWhiteNoise } from './noise.js';

export class RingModulator {
  constructor({ sampleRate = 48000, frequencyHz = 30, amount = 0, carrier = 'sine', seed = 1 } = {}) {
    this.sampleRate = Math.max(1, Number(sampleRate) || 48000);
    this.phase = 0;
    this.frequencyHz = frequencyHz;
    this.amount = amount;
    this.carrier = carrier;
    this.noise = createWhiteNoise(seed);
  }

  setParams({ frequencyHz = this.frequencyHz, amount = this.amount, carrier = this.carrier } = {}) {
    this.frequencyHz = clamp(frequencyHz, 0.01, this.sampleRate * 0.49);
    this.amount = clamp(amount, 0, 1);
    this.carrier = carrier;
  }

  nextCarrier() {
    this.phase = (this.phase + this.frequencyHz / this.sampleRate) % 1;
    if (this.carrier === 'triangle') return 1 - 4 * Math.abs(Math.round(this.phase - 0.25) - (this.phase - 0.25));
    if (this.carrier === 'noise') return this.noise();
    return Math.sin(this.phase * Math.PI * 2);
  }

  process(input) {
    this.setParams();
    const carrier = this.nextCarrier();
    return sanitizeSample(input * ((1 - this.amount) + this.amount * carrier));
  }
}
