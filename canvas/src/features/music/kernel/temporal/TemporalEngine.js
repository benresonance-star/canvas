import {
  createDefaultTemporalState,
  deriveTemporalFromDescriptors,
} from '../../../../../packages/music-core/src/index.js';

export class TemporalEngine {
  constructor(initialState = {}) {
    this.state = createDefaultTemporalState(initialState);
    this.context = null;
    this.input = null;
    this.output = null;
    this.delay = null;
    this.feedback = null;
    this.wet = null;
  }

  async ensureGraph(destination = null) {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!this.context) this.context = new AudioContextCtor();
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.input) {
      this.input = this.context.createGain();
      this.output = this.context.createGain();
      this.delay = this.context.createDelay(4);
      this.feedback = this.context.createGain();
      this.wet = this.context.createGain();
      this.input.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.wet.connect(this.output);
      this.input.connect(this.output);
      this.output.connect(destination ?? this.context.destination);
      this.applyState(this.state);
    }
    return { input: this.input, output: this.output };
  }

  applyState(state = {}) {
    this.state = createDefaultTemporalState(state);
    if (this.delay) this.delay.delayTime.value = Math.max(0.01, Math.min(4, this.state.delayMs / 1000));
    if (this.feedback) this.feedback.gain.value = this.state.feedback;
    if (this.wet) this.wet.gain.value = this.state.wet;
    return this.state;
  }

  applyDescriptors(descriptorGraph) {
    return this.applyState(deriveTemporalFromDescriptors(this.state, descriptorGraph));
  }
}
