export class UniversalInstrumentKernel {
  constructor({ type, engine = null } = {}) {
    this.type = type ?? 'performer';
    this.engine = engine;
    this.state = {};
  }

  setState(state = {}) {
    this.state = state;
    return this.state;
  }

  async trigger(event) {
    if (typeof this.engine?.trigger === 'function') return this.engine.trigger(event, this.state);
    if (typeof this.engine?.playStep === 'function' && Number.isFinite(event?.step)) {
      return this.engine.playStep(event.step);
    }
    return null;
  }
}
