export const CLAY_DEBUG_KEY = 'BIM_CLAY_DEBUG';
export const CLAY_DEBUG_CHANGE_EVENT = 'canvas-bim-clay-debug-change';
export const CLAY_DEBUG_MARKER_EVENT = 'canvas-bim-clay-debug-marker';
export const CLAY_DEBUG_FRAME_EVENT = 'canvas-bim-clay-debug-frame';
export const CLAY_DEBUG_SYNC_EVENT = 'canvas-bim-clay-debug-sync';

const clayDebugListeners = new Set();

export function isBimClayDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CLAY_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setClayDebugEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(CLAY_DEBUG_KEY, '1');
    else localStorage.removeItem(CLAY_DEBUG_KEY);
    if (typeof globalThis !== 'undefined' && typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent(CLAY_DEBUG_CHANGE_EVENT, {
        detail: { enabled: Boolean(enabled) },
      }));
      if (enabled) {
        requestClayDebugSync();
      }
    }
  } catch {
    // ignore storage failures in restricted contexts
  }
}

export function requestClayDebugSync() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(CLAY_DEBUG_SYNC_EVENT));
  }
}

export function toggleClayDebugEnabled() {
  setClayDebugEnabled(!isBimClayDebugEnabled());
}

export function createClayApplyStats() {
  return {
    allLocalIdsCount: 0,
    surfaceBlend: null,
    surfaceColor: null,
    glassOpacity: null,
    reapplyOnly: false,
    blendZone: null,
    resetCalled: false,
    frameReapply: false,
    leavingFull: false,
    lastBlend: null,
    coloredDefinitionCount: 0,
    materialGroupCount: 0,
    definitionMapSize: 0,
    glazingCount: 0,
    highlightedLocalIdCount: 0,
    skippedLocalIdCount: 0,
    nativeLeftCount: 0,
    fallbackUniformCount: 0,
    highlightBatchCount: 0,
    highlightCallCount: 0,
    resetOnly: false,
  };
}

export function publishClayDebugMarker(marker = {}) {
  const nextMarker = {
    ...marker,
    at: new Date().toISOString(),
  };
  if (typeof globalThis !== 'undefined') {
    globalThis.__canvasBimClayDebug = nextMarker;
    if (marker.source === 'effect') {
      globalThis.__canvasBimClayEffectDebug = nextMarker;
    }
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent(CLAY_DEBUG_MARKER_EVENT, {
        detail: nextMarker,
      }));
    }
  }
  if (isBimClayDebugEnabled()) {
    console.debug('[bim-clay]', nextMarker);
  }
  clayDebugListeners.forEach((listener) => {
    try {
      listener(nextMarker);
    } catch {
      // ignore listener failures in debug tooling
    }
  });
  return nextMarker;
}

export function getClayEffectDebugMarker() {
  return globalThis.__canvasBimClayEffectDebug ?? null;
}

export function publishClayFrameDebugSnapshot(stats = {}, extra = {}) {
  const prior = globalThis.__canvasBimClayFrameReapply ?? { count: 0 };
  const snapshot = {
    count: prior.count + 1,
    at: new Date().toISOString(),
    stats,
    ...extra,
  };
  if (typeof globalThis !== 'undefined') {
    globalThis.__canvasBimClayFrameReapply = snapshot;
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent(CLAY_DEBUG_FRAME_EVENT, { detail: snapshot }));
    }
  }
  return snapshot;
}

export function getClayDebugMarker() {
  return globalThis.__canvasBimClayDebug ?? null;
}

export function subscribeClayDebug(listener) {
  if (typeof listener !== 'function') return () => {};
  clayDebugListeners.add(listener);
  const onMarkerEvent = (event) => {
    if (event?.detail) listener(event.detail);
  };
  if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener(CLAY_DEBUG_MARKER_EVENT, onMarkerEvent);
  }
  const current = getClayDebugMarker();
  if (current) listener(current);
  return () => {
    clayDebugListeners.delete(listener);
    if (typeof globalThis !== 'undefined' && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener(CLAY_DEBUG_MARKER_EVENT, onMarkerEvent);
    }
  };
}

export function createClayApplyTimer(label) {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const marks = [];
  const timingEnabled = isBimClayDebugEnabled();
  return {
    mark(name) {
      if (!timingEnabled) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      marks.push({ name, ms: Math.round(now - start) });
    },
    finish(extra = {}) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      publishClayDebugMarker({
        phase: label,
        totalMs: timingEnabled ? Math.round(now - start) : extra.totalMs ?? null,
        marks: timingEnabled ? marks : extra.marks ?? [],
        ...extra,
      });
    },
  };
}
