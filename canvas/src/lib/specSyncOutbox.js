const OUTBOX_KEY = 'canvas:spec-sync-outbox';

/**
 * @returns {Array<{ projectId: string, payload: object, at: number }>}
 */
function readOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries.slice(-20)));
  } catch {
    /* quota */
  }
}

export function enqueueSpecSyncRetry(projectId, payload) {
  if (!projectId || !payload) return;
  const next = readOutbox().filter((e) => e.projectId !== projectId);
  next.push({ projectId, payload, at: Date.now() });
  writeOutbox(next);
}

/**
 * @param {(projectId: string, payload: object) => Promise<boolean>} flushFn
 */
export async function flushSpecSyncOutbox(flushFn) {
  const entries = readOutbox();
  if (entries.length === 0) return;
  const remaining = [];
  for (const entry of entries) {
    try {
      const ok = await flushFn(entry.projectId, entry.payload);
      if (!ok) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  writeOutbox(remaining);
}

/** @internal */
export function clearSpecSyncOutboxForTests() {
  try {
    localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* ignore */
  }
}
