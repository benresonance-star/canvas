import {
  buildFilename,
  cardKeyFromFilename,
  folderPathBasename,
  folderRelativePathFromVersion,
} from './filename.js';
import {
  fetchAgentChatThreadIndex,
  saveAgentChatThreadIndexRemote,
  fetchAgentChatSession,
  saveAgentChatSessionRemote,
  deleteAgentChatSessionRemote,
} from './canvasAgentChatApi.js';
import { initializeAgentChatSync, isAgentChatServerSyncEnabled } from './agentChatSync.js';
import {
  getAgentChatThreadIndexRevision,
  setAgentChatThreadIndexRevision,
} from './agentChatRevision.js';
import { agentChatStorageKey, agentChatThreadIndexStorageKey } from './constants.js';
import { LEGACY_THREAD_ID } from './agentChatThreadConstants.js';

export { LEGACY_THREAD_ID };

export const THREAD_INDEX_VERSION = 1;
export const SESSION_VERSION_V2 = 2;

/**
 * @param {Date} [date]
 */
export function formatThreadAutoTitle(date = new Date()) {
  return `Chat ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

/**
 * @param {string} threadId
 */
export function threadSlugFromId(threadId) {
  const compact = String(threadId).replace(/-/g, '').slice(0, 8);
  return compact || 'thread';
}

/**
 * @param {string} connectorId
 * @param {string} threadId
 */
export function buildAgentChatFilename(connectorId, threadId) {
  const safeConnector = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!threadId || threadId === LEGACY_THREAD_ID) {
    return buildFilename({
      prefix: 'notes',
      name: `agent-chat-${safeConnector}`,
      version: 1,
      ext: 'md',
    });
  }
  const slug = threadSlugFromId(threadId);
  return buildFilename({
    prefix: 'notes',
    name: `agent-chat-${safeConnector}-${slug}`,
    version: 1,
    ext: 'md',
  });
}

/**
 * @param {{ connectorId: string, title?: string }} params
 */
export function createThreadMeta({ connectorId, title }) {
  const threadId = crypto.randomUUID();
  const now = Date.now();
  return {
    threadId,
    title: title || formatThreadAutoTitle(),
    createdAt: now,
    updatedAt: now,
    filename: buildAgentChatFilename(connectorId, threadId),
    artifactRef: null,
    cardId: null,
  };
}

/**
 * @returns {{ version: number, activeThreadId: string | null, threads: object[] }}
 */
export function emptyThreadIndex() {
  return {
    version: THREAD_INDEX_VERSION,
    activeThreadId: null,
    threads: [],
  };
}

function parseThreadIndex(data) {
  if (!data || data.version !== THREAD_INDEX_VERSION) return emptyThreadIndex();
  return {
    version: THREAD_INDEX_VERSION,
    activeThreadId: data.activeThreadId ?? null,
    threads: Array.isArray(data.threads) ? data.threads : [],
  };
}

/** @param {ReturnType<typeof emptyThreadIndex>} index */
export function threadIndexMaxUpdatedAt(index) {
  if (!index?.threads?.length) return 0;
  return Math.max(
    ...index.threads.map((t) => t.updatedAt ?? t.createdAt ?? 0),
  );
}

/**
 * Merge local and remote thread indexes, keeping the newer record per threadId.
 * @param {ReturnType<typeof emptyThreadIndex> | object} localIndex
 * @param {ReturnType<typeof emptyThreadIndex> | object} remoteIndex
 */
export function mergeThreadIndexes(localIndex, remoteIndex) {
  const local = parseThreadIndex(localIndex);
  const remote = parseThreadIndex(remoteIndex);
  const byId = new Map();

  for (const t of remote.threads) {
    byId.set(t.threadId, { ...t });
  }
  for (const t of local.threads) {
    const existing = byId.get(t.threadId);
    const localAt = t.updatedAt ?? t.createdAt ?? 0;
    const remoteAt = existing?.updatedAt ?? existing?.createdAt ?? 0;
    if (!existing || localAt >= remoteAt) {
      byId.set(t.threadId, { ...t });
    }
  }

  const localAt = threadIndexMaxUpdatedAt(local);
  const remoteAt = threadIndexMaxUpdatedAt(remote);
  const preferLocalActive = localAt >= remoteAt;

  return {
    version: THREAD_INDEX_VERSION,
    activeThreadId: preferLocalActive
      ? (local.activeThreadId ?? remote.activeThreadId)
      : (remote.activeThreadId ?? local.activeThreadId),
    threads: [...byId.values()],
  };
}

/**
 * @param {object} indexThread
 * @param {{ title?: string, updatedAt?: number }} discovered
 */
export function pickThreadTitleForMerge(indexThread, discovered) {
  const indexTitle = indexThread.title ?? '';
  const discTitle = discovered.title ?? '';
  const indexAt = indexThread.updatedAt ?? indexThread.createdAt ?? 0;
  const discAt = discovered.updatedAt ?? 0;
  const discIsGeneric = !discTitle || discTitle === 'Chat transcript';

  if (indexAt > discAt) return indexTitle || discTitle;
  if (discIsGeneric && indexTitle && indexTitle !== 'Chat transcript') {
    return indexTitle;
  }
  return discTitle || indexTitle;
}

function readThreadIndexFromLocalStorage(projectId, connectorId) {
  try {
    const raw = localStorage.getItem(
      agentChatThreadIndexStorageKey(projectId, connectorId),
    );
    if (!raw) return emptyThreadIndex();
    return parseThreadIndex(JSON.parse(raw));
  } catch {
    return emptyThreadIndex();
  }
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 */
export async function loadThreadIndex(projectId, connectorId) {
  if (!projectId || !connectorId) return emptyThreadIndex();
  try {
    await initializeAgentChatSync();
    const local = readThreadIndexFromLocalStorage(projectId, connectorId);

    if (isAgentChatServerSyncEnabled()) {
      const remoteRow = await fetchAgentChatThreadIndex(projectId, connectorId);
      const remote = remoteRow?.index;
      if (remote?.version) {
        const merged = mergeThreadIndexes(local, remote);
        if (remoteRow.revision != null) {
          setAgentChatThreadIndexRevision(
            projectId,
            connectorId,
            remoteRow.revision,
          );
        }
        const payload = { ...merged, version: THREAD_INDEX_VERSION };
        localStorage.setItem(
          agentChatThreadIndexStorageKey(projectId, connectorId),
          JSON.stringify(payload),
        );
        return merged;
      }
    }

    return local;
  } catch {
    return emptyThreadIndex();
  }
}

/**
 * Push thread index to server with revision CAS and one conflict merge-retry.
 * @param {string} projectId
 * @param {string} connectorId
 * @param {object} payload
 */
export async function syncThreadIndexRemote(projectId, connectorId, payload) {
  if (!isAgentChatServerSyncEnabled()) return { ok: true };
  let expected = getAgentChatThreadIndexRevision(projectId, connectorId);
  let result = await saveAgentChatThreadIndexRemote(
    projectId,
    connectorId,
    payload,
    expected,
  );
  if (result?.ok) {
    setAgentChatThreadIndexRevision(projectId, connectorId, result.revision);
    return { ok: true };
  }
  if (result?.conflict && result.index) {
    const merged = mergeThreadIndexes(payload, result.index);
    const mergedPayload = { ...merged, version: THREAD_INDEX_VERSION };
    localStorage.setItem(
      agentChatThreadIndexStorageKey(projectId, connectorId),
      JSON.stringify(mergedPayload),
    );
    expected = result.revision ?? expected;
    result = await saveAgentChatThreadIndexRemote(
      projectId,
      connectorId,
      mergedPayload,
      expected,
    );
    if (result?.ok) {
      setAgentChatThreadIndexRevision(projectId, connectorId, result.revision);
      return { ok: true };
    }
  }
  return { ok: false, conflict: Boolean(result?.conflict) };
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 */
export async function flushAgentChatThreadIndexSync(projectId, connectorId) {
  if (!projectId || !connectorId) return;
  await initializeAgentChatSync();
  const raw = localStorage.getItem(
    agentChatThreadIndexStorageKey(projectId, connectorId),
  );
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    await syncThreadIndexRemote(projectId, connectorId, payload);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {{ awaitRemote?: boolean }} [options]
 */
export async function saveThreadIndexLocal(
  projectId,
  connectorId,
  index,
  { awaitRemote = false } = {},
) {
  const payload = { ...index, version: THREAD_INDEX_VERSION };
  localStorage.setItem(
    agentChatThreadIndexStorageKey(projectId, connectorId),
    JSON.stringify(payload),
  );
  if (!isAgentChatServerSyncEnabled()) {
    return payload;
  }
  const remotePromise = syncThreadIndexRemote(projectId, connectorId, payload);
  if (awaitRemote) {
    await remotePromise;
  } else {
    void remotePromise.catch((e) => {
      console.error('Agent chat thread index sync failed:', e);
    });
  }
  return payload;
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {object} threadMeta
 */
export function upsertThreadInIndex(index, threadMeta) {
  const threads = [...index.threads];
  const idx = threads.findIndex((t) => t.threadId === threadMeta.threadId);
  if (idx >= 0) {
    threads[idx] = { ...threads[idx], ...threadMeta, updatedAt: Date.now() };
  } else {
    threads.push({ ...threadMeta, updatedAt: threadMeta.updatedAt ?? Date.now() });
  }
  return { ...index, threads };
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {string} threadId
 * @param {string} title
 */
export function renameThreadInIndex(index, threadId, title) {
  const trimmed = String(title).trim();
  if (!trimmed) return index;
  return {
    ...index,
    threads: index.threads.map((t) =>
      t.threadId === threadId ? { ...t, title: trimmed, updatedAt: Date.now() } : t,
    ),
  };
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {string | null} threadId
 */
export function setActiveThreadInIndex(index, threadId) {
  return { ...index, activeThreadId: threadId };
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {string} threadId
 */
export function removeThreadFromIndex(index, threadId) {
  const threads = index.threads.filter((t) => t.threadId !== threadId);
  const activeThreadId =
    index.activeThreadId === threadId ? null : index.activeThreadId;
  return { ...index, threads, activeThreadId };
}

/**
 * @param {object[]} cards
 * @param {string} connectorId
 */
/**
 * @param {ReturnType<typeof emptyThreadIndex>} threadIndex
 */
export function collectKnownAgentChatKeys(threadIndex) {
  const keys = new Set();
  for (const t of threadIndex?.threads ?? []) {
    if (t.relativePath || t.filename) {
      keys.add(cardKeyFromFilename(t.relativePath || t.filename));
    }
  }
  return keys;
}

/**
 * @param {object[]} stagedCards
 * @param {string} connectorId
 */
export function discoverThreadsFromStaged(stagedCards, connectorId) {
  const safeConnector = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  const prefix = `notes__agent-chat-${safeConnector}`;
  const discovered = [];

  for (const staged of stagedCards || []) {
    const keyBasename = folderPathBasename(staged.key);
    if (staged.type !== 'agent_chat' || !keyBasename.startsWith(prefix)) continue;
    const filename =
      staged.versions?.[0]?.filename
      || `${staged.key}.md`;
    const relativePath = folderRelativePathFromVersion(staged.versions?.[0]);
    discovered.push({
      threadId: null,
      title: staged.name || 'Chat transcript',
      createdAt: 0,
      updatedAt: 0,
      filename,
      relativePath: relativePath || null,
      artifactRef: staged.versions?.[0]?.artifactRef ?? null,
      cardId: null,
      key: staged.key,
    });
  }
  return discovered;
}

export function discoverThreadsFromCanvas(cards, connectorId) {
  const safeConnector = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  const prefix = `notes__agent-chat-${safeConnector}`;
  const discovered = [];

  for (const card of cards || []) {
    const keyBasename = folderPathBasename(card.key);
    if (card.type !== 'agent_chat' || !keyBasename.startsWith(prefix)) continue;
    const filename =
      card.versions?.[0]?.filename
      || `${card.key}.md`;
    const relativePath = folderRelativePathFromVersion(card.versions?.[0]);
    discovered.push({
      threadId: null,
      title: card.name || 'Chat transcript',
      createdAt: 0,
      updatedAt: 0,
      filename,
      relativePath: relativePath || null,
      artifactRef: card.versions?.[0]?.artifactRef ?? null,
      cardId: card.id,
      key: card.key,
    });
  }
  return discovered;
}

/**
 * Merge canvas-discovered threads into index (by filename / cardId).
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {object[]} discovered
 */
/**
 * Clear canvas card linkage when the user deleted the card from the canvas.
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {string} cardId
 */
export function clearCardIdFromThreadIndex(index, cardId) {
  if (!cardId) return index;
  let changed = false;
  const threads = index.threads.map((t) => {
    if (t.cardId !== cardId) return t;
    changed = true;
    return { ...t, cardId: null };
  });
  return changed ? { ...index, threads } : index;
}

/**
 * Match thread id from filename slug (first 8 hex of UUID).
 * @param {object[]} threads
 * @param {string} filename
 */
export function findThreadIdByFilenameSlug(threads, filename) {
  const match = String(filename).match(/agent-chat-[^-]+-([a-f0-9]{8})-v\d+\.md$/i);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  for (const t of threads) {
    if (threadSlugFromId(t.threadId) === slug) return t.threadId;
  }
  return null;
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {object} card
 * @param {string} connectorId
 */
export function resolveThreadForCard(index, card, connectorId) {
  if (!card || card.type !== 'agent_chat') return null;
  if (card.agentThreadId) {
    const byId = index.threads.find((t) => t.threadId === card.agentThreadId);
    if (byId) return byId;
  }
  if (card.id) {
    const byCard = index.threads.find((t) => t.cardId === card.id);
    if (byCard) return byCard;
  }
  const filename = card.versions?.[0]?.filename;
  if (filename) {
    const byFile = index.threads.find((t) => t.filename === filename);
    if (byFile) return byFile;
    const slugId = findThreadIdByFilenameSlug(index.threads, filename);
    if (slugId) return index.threads.find((t) => t.threadId === slugId) ?? null;
  }
  const safeConnector = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  const prefix = `notes__agent-chat-${safeConnector}`;
  if (card.key?.startsWith(prefix)) {
    const inferredFilename = `${card.key}.md`;
    const byKey = index.threads.find((t) => t.filename === inferredFilename);
    if (byKey) return byKey;
  }
  return null;
}

/**
 * @param {ReturnType<typeof emptyThreadIndex>} index
 * @param {string} threadId
 * @param {{ cardId?: string | null, artifactRef?: object | null, filename?: string | null }} patch
 */
export function linkCardToThreadInIndex(index, threadId, patch) {
  const thread = index.threads.find((t) => t.threadId === threadId);
  if (!thread) return index;
  return upsertThreadInIndex(index, {
    ...thread,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function mergeDiscoveredThreads(index, discovered, connectorId) {
  let next = { ...index, threads: [...index.threads] };
  for (const d of discovered) {
    const byCard = d.cardId && next.threads.find((t) => t.cardId === d.cardId);
    const byFile = d.filename
      ? next.threads.find((t) => t.filename === d.filename)
      : null;
    if (byCard) continue;
    if (byFile) {
      next = upsertThreadInIndex(next, {
        ...byFile,
        title: pickThreadTitleForMerge(byFile, d),
        cardId: d.cardId ?? byFile.cardId,
        artifactRef: d.artifactRef ?? byFile.artifactRef,
        updatedAt: Math.max(byFile.updatedAt ?? 0, d.updatedAt ?? 0) || Date.now(),
      });
      continue;
    }
    const existingId = d.filename
      ? findThreadIdByFilenameSlug(next.threads, d.filename)
      : null;
    const existingThread = existingId
      ? next.threads.find((t) => t.threadId === existingId)
      : null;
    const meta = existingThread
      ? {
          ...existingThread,
          title: pickThreadTitleForMerge(existingThread, d),
        }
      : createThreadMeta({
          connectorId,
          title: d.title,
        });
    next = upsertThreadInIndex(next, {
      ...meta,
      filename: d.filename,
      artifactRef: d.artifactRef ?? meta.artifactRef,
      cardId: d.cardId ?? meta.cardId,
    });
  }
  return next;
}

/**
 * Migrate legacy single-session storage into a "Previous chat" thread.
 * @param {string} projectId
 * @param {string} connectorId
 */
export async function migrateLegacyAgentChatToThreads(projectId, connectorId) {
  const legacyKey = agentChatStorageKey(projectId, connectorId);
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const index = emptyThreadIndex();
  const threadId = LEGACY_THREAD_ID;
  const filename =
    data.filename || buildAgentChatFilename(connectorId, LEGACY_THREAD_ID);
  const threadMeta = {
    threadId,
    title: 'Previous chat',
    createdAt: data.updatedAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
    filename,
    artifactRef: data.artifactRef ?? null,
    cardId: data.cardId ?? null,
  };

  let nextIndex = upsertThreadInIndex(index, threadMeta);
  nextIndex = setActiveThreadInIndex(nextIndex, threadId);
  saveThreadIndexLocal(projectId, connectorId, nextIndex);

  const session = {
    version: SESSION_VERSION_V2,
    threadId,
    title: threadMeta.title,
    updatedAt: data.updatedAt ?? Date.now(),
    messages: data.messages ?? [],
    registry: data.registry ?? { keys: [], entries: [] },
    artifactRef: data.artifactRef ?? null,
    filename,
    cardId: data.cardId ?? null,
  };

  localStorage.setItem(
    agentChatStorageKey(projectId, connectorId, threadId),
    JSON.stringify(session),
  );

  if (isAgentChatServerSyncEnabled()) {
    try {
      const remoteLegacy = await fetchAgentChatSession(projectId, connectorId);
      if (remoteLegacy?.version && !remoteLegacy.threadId) {
        const migrated = {
          ...session,
          messages: remoteLegacy.messages ?? session.messages,
          registry: remoteLegacy.registry ?? session.registry,
          artifactRef: remoteLegacy.artifactRef ?? session.artifactRef,
          filename: remoteLegacy.filename ?? session.filename,
        };
        await saveAgentChatSessionRemote(projectId, connectorId, migrated, threadId);
        await saveAgentChatThreadIndexRemote(projectId, connectorId, nextIndex);
      } else {
        await saveAgentChatSessionRemote(projectId, connectorId, session, threadId);
        await saveAgentChatThreadIndexRemote(projectId, connectorId, nextIndex);
      }
    } catch {
      /* ignore */
    }
  }

  localStorage.removeItem(legacyKey);
  return { index: nextIndex, threadId, session };
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 * @param {string} threadId
 */
export async function deleteThreadSession(projectId, connectorId, threadId) {
  try {
    localStorage.removeItem(agentChatStorageKey(projectId, connectorId, threadId));
  } catch {
    /* ignore */
  }
  if (isAgentChatServerSyncEnabled()) {
    try {
      await deleteAgentChatSessionRemote(projectId, connectorId, threadId);
    } catch {
      /* ignore */
    }
  }
}
