export class AudioEngine {
  constructor() {
    this.context = null;
  }

  async ensureContext() {
    if (this.context) return this.context;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('WebAudio is not available in this browser');
    this.context = new AudioContextCtor();
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    return this.context;
  }

  async stop() {
    /* Engines can override. */
  }

  async dispose() {
    if (this.context?.state !== 'closed') {
      await this.context?.close?.();
    }
    this.context = null;
  }
}
