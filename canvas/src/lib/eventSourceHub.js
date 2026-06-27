/** @type {Map<string, { source: EventSource | null, listeners: Map<string, Set<EventListener>>, reconnectTimer: ReturnType<typeof setTimeout> | null, reconnectAttempt: number }>} */
const subscriptionsByUrl = new Map();

const MAX_RECONNECT_MS = 30000;

function createEntry() {
  return {
    source: null,
    listeners: new Map(),
    reconnectTimer: null,
    reconnectAttempt: 0,
  };
}

function hasListeners(entry) {
  for (const listeners of entry.listeners.values()) {
    if (listeners.size > 0) return true;
  }
  return false;
}

function clearReconnect(entry) {
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
}

function closeEntry(entry) {
  clearReconnect(entry);
  if (entry.source) {
    entry.source.close();
    entry.source = null;
  }
}

function openSource(url, entry) {
  if (entry.source || typeof EventSource === 'undefined') return;
  const source = new EventSource(url);
  entry.source = source;

  for (const [eventName, listeners] of entry.listeners.entries()) {
    for (const listener of listeners) {
      source.addEventListener(eventName, listener);
    }
  }

  source.onopen = () => {
    entry.reconnectAttempt = 0;
  };

  source.onerror = () => {
    if (entry.source === source) {
      entry.source = null;
    }
    source.close();
    if (!hasListeners(entry)) return;
    clearReconnect(entry);
    const delay = Math.min(1000 * 2 ** entry.reconnectAttempt, MAX_RECONNECT_MS);
    entry.reconnectAttempt += 1;
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      openSource(url, entry);
    }, delay);
  };
}

/**
 * Share one EventSource per URL across components.
 * @param {string | null | undefined} url
 * @param {string} eventName
 * @param {EventListener} listener
 * @returns {() => void}
 */
export function subscribeEventSource(url, eventName, listener) {
  if (!url || typeof EventSource === 'undefined') return () => {};
  const entry = subscriptionsByUrl.get(url) ?? createEntry();
  subscriptionsByUrl.set(url, entry);

  const listeners = entry.listeners.get(eventName) ?? new Set();
  listeners.add(listener);
  entry.listeners.set(eventName, listeners);
  if (entry.source) {
    entry.source.addEventListener(eventName, listener);
  }
  openSource(url, entry);

  return () => {
    const current = subscriptionsByUrl.get(url);
    if (!current) return;
    const currentListeners = current.listeners.get(eventName);
    currentListeners?.delete(listener);
    if (current.source) {
      current.source.removeEventListener(eventName, listener);
    }
    if (currentListeners?.size === 0) {
      current.listeners.delete(eventName);
    }
    if (!hasListeners(current)) {
      closeEntry(current);
      subscriptionsByUrl.delete(url);
    }
  };
}

/** @internal */
export function resetEventSourceHubForTests() {
  for (const entry of subscriptionsByUrl.values()) {
    closeEntry(entry);
  }
  subscriptionsByUrl.clear();
}
