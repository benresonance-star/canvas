export class MusicEventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  publish(type, payload = {}) {
    const event = { type, payload, createdAt: new Date().toISOString() };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    for (const listener of this.listeners.get('*') ?? []) {
      listener(event);
    }
    return event;
  }
}
