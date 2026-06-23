export const FLOW_AUTOSAVE_DELAY_MS = 900;
export const FLOW_SAVE_RETRY_DELAY_MS = 2000;
export const FLOW_CHAINED_SAVE_DELAY_MS = 50;
export const FLOW_FLUSH_MAX_ATTEMPTS = 3;
export const FLOW_FLUSH_WAIT_MS = 5000;
export const FLOW_FLUSH_POLL_MS = 25;

export function clearAutosaveTimer(timerRef) {
  if (timerRef.current != null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function scheduleAutosave({
  timerRef,
  delayMs,
  canSchedule,
  onFire,
}) {
  clearAutosaveTimer(timerRef);
  if (!canSchedule()) return;
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    onFire();
  }, delayMs);
}

export function syncFlowRevisionRefs(latestRef, revisionRef, saved) {
  revisionRef.current = saved.revision;
  if (!latestRef.current.flow) return;
  latestRef.current = {
    ...latestRef.current,
    flow: {
      ...latestRef.current.flow,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
    },
  };
}

function resolveUpdaterValue(updater, previous) {
  return typeof updater === 'function' ? updater(previous) : updater;
}

export async function runBoundedFlush({
  isActive,
  isDirty,
  isSaving,
  hasPending,
  saveOnce,
  maxAttempts = FLOW_FLUSH_MAX_ATTEMPTS,
  waitMs = FLOW_FLUSH_WAIT_MS,
  pollMs = FLOW_FLUSH_POLL_MS,
}) {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;
  let conflict = false;

  while (isActive() && (isDirty() || isSaving() || hasPending())) {
    if (Date.now() - startedAt > waitMs) {
      return {
        ok: false,
        conflict,
        error: lastError ?? new Error('Flow save timed out while closing'),
      };
    }

    if (isSaving()) {
      await new Promise((resolve) => {
        setTimeout(resolve, pollMs);
      });
      continue;
    }

    if (!isDirty() && !hasPending()) {
      return { ok: true, conflict: false, error: null };
    }

    if (attempts >= maxAttempts) {
      return {
        ok: false,
        conflict,
        error: lastError ?? new Error('Flow save exceeded retry limit while closing'),
      };
    }

    attempts += 1;
    const result = await saveOnce();
    if (result?.conflict) {
      return { ok: false, conflict: true, error: result.error ?? new Error('revision conflict') };
    }
    if (result?.error) {
      lastError = result.error;
      if (!isDirty() && !hasPending()) {
        return { ok: false, conflict: false, error: lastError };
      }
      continue;
    }
    if (result?.saved) {
      lastError = null;
    }
  }

  return {
    ok: !isDirty(),
    conflict,
    error: isDirty() ? lastError : null,
  };
}

export { resolveUpdaterValue };
