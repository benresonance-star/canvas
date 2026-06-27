import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }

  addEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
  }

  removeEventListener(eventName, listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  close() {
    this.closed = true;
  }
}

describe('eventSourceHub', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(async () => {
    const { resetEventSourceHubForTests } = await import('../eventSourceHub.js');
    resetEventSourceHubForTests();
    vi.unstubAllGlobals();
  });

  it('shares one EventSource for multiple listeners on the same URL', async () => {
    const { subscribeEventSource } = await import('../eventSourceHub.js');
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribeEventSource('/api/stream', 'updated', first);
    const unsubscribeSecond = subscribeEventSource('/api/stream', 'updated', second);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].listeners.get('updated')?.size).toBe(2);

    unsubscribeFirst();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    expect(FakeEventSource.instances[0].listeners.get('updated')?.size).toBe(1);

    unsubscribeSecond();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
