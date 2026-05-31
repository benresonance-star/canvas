import {
  agentChatStorageKey,
  AGENT_CHAT_STORAGE_SOFT_BYTES,
} from './constants.js';
import { createContextRegistry, stripApiContentForStorage } from './agentContextSession.js';
import { SESSION_VERSION_V2 } from './agentChatThreads.js';
import {
  initializeAgentChatSync,
  scheduleAgentChatRemoteSave,
  fetchAgentChatSessionFromServer,
  migrateLocalAgentChatToServer,
  flushAgentChatSync,
  isAgentChatServerSyncEnabled,
} from './agentChatSync.js';
import {
  getAgentChatRaw,
  setAgentChatRaw,
  removeAgentChatRaw,
  migrateAgentChatFromLocalStorage,
} from './agentChatStore.js';

export { flushAgentChatSync };
export { flushAgentChatThreadIndexSync } from './agentChatThreads.js';

const SESSION_VERSION_V1 = 1;
const TRIM_KEEP_TURNS = 80;

let agentChatStoreMigrated = false;

async function ensureAgentChatStoreMigrated() {
  if (agentChatStoreMigrated) return;
  agentChatStoreMigrated = true;
  try {
    await migrateAgentChatFromLocalStorage();
  } catch {
    /* ignore */
  }
}

async function readChatJson(storageKey) {
  await ensureAgentChatStoreMigrated();
  const fromIdb = await getAgentChatRaw(storageKey);
  if (fromIdb) return fromIdb;
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

async function writeChatJson(storageKey, json) {
  await ensureAgentChatStoreMigrated();
  let toWrite = json;
  if (isAgentChatServerSyncEnabled()) {
    try {
      const parsed = JSON.parse(json);
      parsed.registry = { keys: [], entries: [] };
      toWrite = JSON.stringify(parsed);
    } catch {
      /* keep */
    }
  }
  try {
    await setAgentChatRaw(storageKey, toWrite);
  } catch {
    /* idb */
  }
  try {
    localStorage.setItem(storageKey, toWrite);
  } catch {
    /* quota */
  }
}

/**
 * @param {{ keys: Set<string>, byCardId: Map<string, object> }} registry
 */
export function serializeRegistry(registry) {
  return {
    keys: [...registry.keys],
    entries: [...registry.byCardId.values()],
  };
}

/**
 * @param {{ keys?: string[], entries?: object[] } | null | undefined} data
 */
export function deserializeRegistry(data) {
  const registry = createContextRegistry();
  if (!data) return registry;
  for (const key of data.keys || []) {
    registry.keys.add(key);
  }
  for (const entry of data.entries || []) {
    if (!entry?.cardId || !entry?.key) continue;
    registry.keys.add(entry.key);
    registry.byCardId.set(entry.cardId, entry);
  }
  return registry;
}

/**
 * @param {object[]} messages
 */
function trimMessagesForStorage(messages) {
  const indexed = messages.map((m, i) => ({ m, i }));
  const context = indexed.filter(
    ({ m }) => m.kind === 'context_add' || m.kind === 'context_remove',
  );
  const conversational = indexed.filter(
    ({ m }) => m.kind !== 'context_add' && m.kind !== 'context_remove',
  );
  const keptConv =
    conversational.length > TRIM_KEEP_TURNS * 2
      ? conversational.slice(-TRIM_KEEP_TURNS * 2)
      : conversational;
  return [...context, ...keptConv].sort((a, b) => a.i - b.i).map(({ m }) => m);
}

/**
 * @param {object} payload
 * @param {string} [threadId]
 * @param {string} [title]
 */
function buildSessionPayload(payload, threadId, title) {
  let messages = stripApiContentForStorage(payload.messages || []);
  let trimmed = false;
  const version = threadId ? SESSION_VERSION_V2 : SESSION_VERSION_V1;
  let session = {
    version,
    updatedAt: Date.now(),
    messages,
    registry: payload.registry || { keys: [], entries: [] },
    artifactRef: payload.artifactRef ?? null,
    filename: payload.filename ?? null,
    ...(threadId
      ? {
          threadId,
          title: title ?? payload.title ?? null,
          cardId: payload.cardId ?? null,
        }
      : {}),
  };
  let json = JSON.stringify(session);
  if (json.length > AGENT_CHAT_STORAGE_SOFT_BYTES) {
    messages = trimMessagesForStorage(messages);
    trimmed = true;
    session = { ...session, messages, updatedAt: Date.now() };
    json = JSON.stringify(session);
  }
  return { session, json, trimmed };
}

function parseStoredSession(data) {
  if (!data) return null;
  if (data.version !== SESSION_VERSION_V1 && data.version !== SESSION_VERSION_V2) {
    return null;
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    registry: deserializeRegistry(data.registry),
    artifactRef: data.artifactRef ?? null,
    filename: data.filename ?? null,
    updatedAt: data.updatedAt ?? null,
    threadId: data.threadId ?? null,
    title: data.title ?? null,
    cardId: data.cardId ?? null,
  };
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 * @param {string} threadId
 */
export async function loadAgentChatSession(projectId, connectorId, threadId) {
  if (!projectId || !connectorId || !threadId) return null;
  try {
    await initializeAgentChatSync();

    const remote = await fetchAgentChatSessionFromServer(
      projectId,
      connectorId,
      threadId,
    );
    if (remote?.version) {
      await writeChatJson(
        agentChatStorageKey(projectId, connectorId, threadId),
        JSON.stringify(remote),
      );
      return parseStoredSession(remote);
    }

    const raw = await readChatJson(
      agentChatStorageKey(projectId, connectorId, threadId),
    );
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = parseStoredSession(data);
    if (parsed && data?.messages?.length) {
      await migrateLocalAgentChatToServer(projectId, connectorId, data, threadId);
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 * @param {string} threadId
 * @param {{ messages: object[], registry: object, artifactRef?: object | null, filename?: string | null, title?: string, cardId?: string | null }} payload
 */
export async function saveAgentChatSession(projectId, connectorId, threadId, payload) {
  if (!projectId || !connectorId || !threadId) {
    return { ok: false, error: 'missing project, connector, or thread' };
  }
  try {
    const { session, json, trimmed } = buildSessionPayload(
      payload,
      threadId,
      payload.title,
    );
    await writeChatJson(agentChatStorageKey(projectId, connectorId, threadId), json);
    void initializeAgentChatSync().then(() => {
      scheduleAgentChatRemoteSave(projectId, connectorId, session, threadId);
    });
    return { ok: true, trimmed };
  } catch (e) {
    return { ok: false, error: e?.message || 'save failed' };
  }
}

/**
 * @param {string} projectId
 * @param {string} connectorId
 * @param {string} threadId
 */
export function clearAgentChatSession(projectId, connectorId, threadId) {
  if (!projectId || !connectorId || !threadId) return;
  try {
    void removeAgentChatRaw(agentChatStorageKey(projectId, connectorId, threadId));
    localStorage.removeItem(agentChatStorageKey(projectId, connectorId, threadId));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} projectId
 */
export function clearAgentChatSessionsForProject(projectId) {
  if (!projectId) return;
  const prefixes = [
    `canvas:agent-chat:${projectId}:`,
    `canvas:agent-chat-threads:${projectId}:`,
  ];
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (prefixes.some((p) => key?.startsWith(p))) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {object[]} messages
 */
export function maxAgentChatMessageId(messages) {
  let max = 0;
  for (const m of messages) {
    const match = String(m.id || '').match(/(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}
