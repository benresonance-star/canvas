import { workspaceIndexStreamUrl } from '../canvasProjectsApi.js';
import { getProjectSyncClientId } from './projectSyncClientId.js';
import { isServerSyncEnabled } from './projectSyncState.js';
import {
  applyServerWorkspaceIndexRevision,
  getClientWorkspaceIndexRevision,
} from '../workspaceIndexRevision.js';

/** @type {EventSource | null} */
let activeSource = null;
/** @type {((data: object) => void) | null} */
let onIndexUpdatedHandler = null;
let reconnectTimer = null;
let reconnectAttempt = 0;

const MAX_RECONNECT_MS = 30000;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_MS);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    if (onIndexUpdatedHandler) {
      startWorkspaceIndexSyncStream(onIndexUpdatedHandler);
    }
  }, delay);
}

function handleIndexEvent(data) {
  const revision = Number(data.revision) || 0;
  const clientId = data.clientId ?? null;
  if (clientId && clientId === getProjectSyncClientId()) {
    if (revision > getClientWorkspaceIndexRevision()) {
      applyServerWorkspaceIndexRevision(revision);
    }
    return;
  }
  if (revision <= getClientWorkspaceIndexRevision()) return;
  applyServerWorkspaceIndexRevision(revision);
  onIndexUpdatedHandler?.(data);
}

/**
 * Subscribe to workspace index changes (project renames, creates, archive).
 * @param {(data: { revision: number, updatedAt?: string | null, clientId?: string | null }) => void} onIndexUpdated
 */
export function startWorkspaceIndexSyncStream(onIndexUpdated) {
  if (!getServerSyncEnabled()) return;
  if (typeof EventSource === 'undefined') return;

  stopWorkspaceIndexSyncStream();
  onIndexUpdatedHandler = onIndexUpdated;

  const url = workspaceIndexStreamUrl();
  const source = new EventSource(url);
  activeSource = source;

  source.addEventListener('index_updated', (event) => {
    try {
      handleIndexEvent(JSON.parse(event.data));
    } catch (e) {
      console.warn('SSE index_updated parse failed:', e);
    }
  });

  source.addEventListener('revision', (event) => {
    try {
      handleIndexEvent(JSON.parse(event.data));
    } catch {
      /* ignore */
    }
  });

  source.onopen = () => {
    reconnectAttempt = 0;
  };

  source.onerror = () => {
    source.close();
    if (activeSource === source) {
      activeSource = null;
    }
    scheduleReconnect();
  };
}

export function stopWorkspaceIndexSyncStream() {
  clearReconnectTimer();
  if (activeSource) {
    activeSource.close();
    activeSource = null;
  }
  onIndexUpdatedHandler = null;
  reconnectAttempt = 0;
}

/** @internal */
export function resetWorkspaceIndexSyncStreamForTests() {
  stopWorkspaceIndexSyncStream();
}
