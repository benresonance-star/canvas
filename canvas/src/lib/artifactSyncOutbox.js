const OUTBOX_KEY = 'canvas:artifact-sync-outbox';
const MAX_OUTBOX_ENTRIES = 100;

function now() {
  return Date.now();
}

function entryKey(entry) {
  return [
    entry?.kind,
    entry?.projectId,
    entry?.connectorId ?? '',
    entry?.threadId ?? '',
    entry?.cardKey ?? '',
    entry?.filename ?? '',
    entry?.url ?? '',
  ].join('|');
}

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
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries.slice(-MAX_OUTBOX_ENTRIES)));
  } catch {
    /* quota */
  }
}

export function listArtifactSyncOutbox({ projectId } = {}) {
  const entries = readOutbox();
  return projectId ? entries.filter((entry) => entry.projectId === projectId) : entries;
}

export function hasPendingArtifactSync({ projectId, cardKey, threadId, filename } = {}) {
  return readOutbox().some((entry) => (
    (!projectId || entry.projectId === projectId)
    && (!cardKey || entry.cardKey === cardKey)
    && (!threadId || entry.threadId === threadId)
    && (!filename || entry.filename === filename)
  ));
}

export function enqueueArtifactSyncRetry(entry) {
  if (!entry?.kind || !entry?.projectId) return null;
  const timestamp = now();
  const normalized = {
    ...entry,
    attempts: entry.attempts ?? 0,
    createdAt: entry.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastError: entry.lastError ?? null,
  };
  const key = entryKey(normalized);
  const next = readOutbox().filter((item) => entryKey(item) !== key);
  next.push(normalized);
  writeOutbox(next);
  return normalized;
}

export function removeArtifactSyncRetry(match) {
  if (!match) return;
  const key = entryKey(match);
  writeOutbox(readOutbox().filter((entry) => entryKey(entry) !== key));
}

/**
 * @param {(entry: object) => Promise<{ ok?: boolean, lastError?: string } | boolean | null | undefined>} processEntry
 * @param {{ projectId?: string }} [options]
 */
export async function flushArtifactSyncOutbox(processEntry, { projectId } = {}) {
  const entries = readOutbox();
  if (entries.length === 0 || typeof processEntry !== 'function') return { flushed: 0, remaining: 0 };
  const remaining = [];
  let flushed = 0;

  for (const entry of entries) {
    if (projectId && entry.projectId !== projectId) {
      remaining.push(entry);
      continue;
    }
    try {
      const result = await processEntry(entry);
      const ok = result === true || Boolean(result?.ok);
      if (ok) {
        flushed += 1;
      } else {
        remaining.push({
          ...entry,
          attempts: (entry.attempts ?? 0) + 1,
          updatedAt: now(),
          lastError: result?.lastError ?? entry.lastError ?? 'retry failed',
        });
      }
    } catch (e) {
      remaining.push({
        ...entry,
        attempts: (entry.attempts ?? 0) + 1,
        updatedAt: now(),
        lastError: e?.message ?? 'retry failed',
      });
    }
  }

  writeOutbox(remaining);
  return { flushed, remaining: remaining.length };
}

/** @internal */
export function clearArtifactSyncOutboxForTests() {
  try {
    localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* ignore */
  }
}
