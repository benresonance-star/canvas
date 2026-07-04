const PICK_DEBUG_KEY = 'BIM_PICK_DEBUG';

export function isBimPickDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PICK_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function createPickTimer(label) {
  if (!isBimPickDebugEnabled()) {
    return {
      mark() {},
      finish() {},
    };
  }
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const marks = [];
  return {
    mark(name) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      marks.push({ name, ms: Math.round(now - start) });
    },
    finish(extra = {}) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      console.debug('[bim-pick]', label, {
        totalMs: Math.round(now - start),
        marks,
        ...extra,
      });
    },
  };
}

export function logBimPickWarning(message, detail = {}) {
  if (isBimPickDebugEnabled()) {
    console.warn('[bim-pick]', message, detail);
  }
}

export function logBimPickMappingFailure(reason, detail = {}) {
  logBimPickWarning(`mapping failure: ${reason}`, detail);
}
