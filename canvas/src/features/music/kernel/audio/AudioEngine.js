export class AudioEngine {
  constructor() {
    this.context = null;
  }

  prepareUserGesture() {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!this.context) {
      this.context = new AudioContextCtor();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  async ensureContext() {
    if (this.context) return this.context;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('WebAudio is not available in this browser');
    this.context = new AudioContextCtor();
    return this.context;
  }

  async resumeIfNeeded() {
    const context = await this.ensureContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }

  getContextState() {
    return this.context?.state ?? 'none';
  }

  subscribeContextState(listener) {
    const notify = () => listener(this.getContextState());
    notify();
    const attach = (context) => {
      context?.addEventListener?.('statechange', notify);
    };
    attach(this.context);
    const intervalId = window.setInterval(() => {
      if (this.context && this.context.state === 'running') {
        window.clearInterval(intervalId);
      }
      notify();
    }, 400);
    return () => {
      window.clearInterval(intervalId);
      this.context?.removeEventListener?.('statechange', notify);
    };
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
