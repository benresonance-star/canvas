import {
  fetchAgentChatSession,
  fetchAgentChatSessionForThread,
  saveAgentChatSessionRemote,
} from './canvasAgentChatApi.js';
import {
  getAgentChatSessionRevision,
  setAgentChatSessionRevision,
} from './agentChatRevision.js';
import { isApiAvailable } from './primitivesApi.js';

const DEBOUNCE_MS = 600;

let initialized = false;
let serverSyncEnabled = false;
const pendingTimers = new Map();
/** @type {Map<string, object>} */
const pendingSessions = new Map();

function pendingKey(projectId, connectorId, threadId) {
  return `${projectId}|${connectorId}|${threadId}`;
}

/** @internal tests */
export function resetAgentChatSyncState() {
  initialized = false;
  serverSyncEnabled = false;
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
  pendingSessions.clear();
}

export async function initializeAgentChatSync() {
  if (initialized) return serverSyncEnabled;
  serverSyncEnabled = await isApiAvailable();
  initialized = true;
  return serverSyncEnabled;
}

export function isAgentChatServerSyncEnabled() {
  return serverSyncEnabled;
}

export function scheduleAgentChatRemoteSave(
  projectId,
  connectorId,
  session,
  threadId,
) {
  if (!serverSyncEnabled) return;
  const tid = threadId ?? session?.threadId;
  if (!tid) {
    scheduleAgentChatRemoteSaveLegacy(projectId, connectorId, session);
    return;
  }
  const key = pendingKey(projectId, connectorId, tid);
  pendingSessions.set(key, session);
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    const payload = pendingSessions.get(key);
    pendingSessions.delete(key);
    if (payload) {
      const expected = getAgentChatSessionRevision(projectId, connectorId, tid);
      saveAgentChatSessionRemote(projectId, connectorId, payload, tid, expected)
        .then((result) => {
          if (result?.ok) {
            setAgentChatSessionRevision(
              projectId,
              connectorId,
              tid,
              result.revision,
            );
          }
        })
        .catch((e) => {
          console.error('Agent chat sync failed:', e);
        });
    }
  }, DEBOUNCE_MS);
  pendingTimers.set(key, timer);
}

function scheduleAgentChatRemoteSaveLegacy(projectId, connectorId, session) {
  const key = pendingKey(projectId, connectorId, 'legacy');
  pendingSessions.set(key, session);
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    const payload = pendingSessions.get(key);
    pendingSessions.delete(key);
    if (payload) {
      const expected = getAgentChatSessionRevision(projectId, connectorId, 'legacy');
      saveAgentChatSessionRemote(projectId, connectorId, payload, undefined, expected)
        .then((result) => {
          if (result?.ok) {
            setAgentChatSessionRevision(
              projectId,
              connectorId,
              'legacy',
              result.revision,
            );
          }
        })
        .catch((e) => {
          console.error('Agent chat sync failed:', e);
        });
    }
  }, DEBOUNCE_MS);
  pendingTimers.set(key, timer);
}

export async function fetchAgentChatSessionFromServer(
  projectId,
  connectorId,
  threadId,
) {
  if (!serverSyncEnabled) return null;
  try {
    if (threadId) {
      const row = await fetchAgentChatSessionForThread(
        projectId,
        connectorId,
        threadId,
      );
      if (row?.session) {
        setAgentChatSessionRevision(
          projectId,
          connectorId,
          threadId,
          row.revision,
        );
      }
      return row?.session ?? null;
    }
    const session = await fetchAgentChatSession(projectId, connectorId);
    return session;
  } catch {
    return null;
  }
}

export async function migrateLocalAgentChatToServer(
  projectId,
  connectorId,
  localSession,
  threadId,
) {
  if (!serverSyncEnabled || !localSession?.version) return;
  try {
    const remote = threadId
      ? (await fetchAgentChatSessionForThread(projectId, connectorId, threadId))
          ?.session
      : await fetchAgentChatSession(projectId, connectorId);
    if (!remote) {
      const result = await saveAgentChatSessionRemote(
        projectId,
        connectorId,
        localSession,
        threadId,
        0,
      );
      if (result?.ok) {
        setAgentChatSessionRevision(
          projectId,
          connectorId,
          threadId ?? 'legacy',
          result.revision,
        );
      }
      console.log('Migrated agent chat session to server storage.');
    }
  } catch {
    /* ignore */
  }
}

export async function flushAgentChatSync() {
  for (const [key, timer] of pendingTimers) {
    clearTimeout(timer);
    pendingTimers.delete(key);
  }

  if (!serverSyncEnabled) {
    pendingSessions.clear();
    return;
  }

  const entries = [...pendingSessions.entries()];
  pendingSessions.clear();

  await Promise.all(
    entries.map(async ([key, session]) => {
      const parts = key.split('|');
      const projectId = parts[0];
      const connectorId = parts[1];
      const threadId = parts[2];
      try {
        const tid = threadId === 'legacy' ? undefined : threadId;
        const expected = getAgentChatSessionRevision(
          projectId,
          connectorId,
          threadId,
        );
        const result = await saveAgentChatSessionRemote(
          projectId,
          connectorId,
          session,
          tid,
          expected,
        );
        if (result?.ok) {
          setAgentChatSessionRevision(
            projectId,
            connectorId,
            threadId,
            result.revision,
          );
        }
      } catch (e) {
        console.error('Agent chat flush failed:', e);
      }
    }),
  );
}
