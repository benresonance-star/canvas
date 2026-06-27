import {
  createDefaultSpaceState,
  deriveSpaceFromDescriptors,
} from '../../../../../packages/music-core/src/index.js';

export class AcousticSpaceEngine {
  constructor(initialState = {}) {
    this.state = createDefaultSpaceState(initialState);
    this.context = null;
    this.input = null;
    this.output = null;
    this.wet = null;
  }

  async ensureGraph(destination = null) {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!this.context) this.context = new AudioContextCtor();
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.input) {
      this.input = this.context.createGain();
      this.wet = this.context.createGain();
      this.output = this.context.createGain();
      this.input.connect(this.wet);
      this.wet.connect(this.output);
      this.output.connect(destination ?? this.context.destination);
      this.applyState(this.state);
    }
    return { input: this.input, output: this.output };
  }

  applyState(state = {}) {
    this.state = createDefaultSpaceState(state);
    if (this.wet) this.wet.gain.value = Math.max(0, Math.min(0.85, this.state.roomSize * 0.5));
    return this.state;
  }

  applyDescriptors(descriptorGraph) {
    return this.applyState(deriveSpaceFromDescriptors(this.state, descriptorGraph));
  }
}
