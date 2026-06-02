import { projectSyncStreamUrl } from '../canvasProjectsApi.js';
import { getProjectSyncClientId } from './projectSyncClientId.js';
import { isProjectPatchSyncEnabled } from './projectPatchSync.js';
import { isServerSyncEnabled } from './projectSyncState.js';
import { applyRemoteProjectPatch } from './projectSyncRemoteApply.js';
import {
  applyServerProjectRevision,
  ensureClientRevision,
  getClientRevision,
} from './projectSyncRevision.js';
import { summarizePatchOps, syncTraceLog } from './syncTrace.js';

/** @type {EventSource | null} */
let activeSource = null;
/** @type {string | null} */
let activeProjectId = null;
let reconnectTimer = null;
let reconnectAttempt = 0;

const MAX_RECONNECT_MS = 30000;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(projectId) {
  clearReconnectTimer();
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_MS);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    if (activeProjectId === projectId) {
      startProjectSyncStream(projectId);
    }
  }, delay);
}

/**
 * @param {string} projectId
 */
export function startProjectSyncStream(projectId) {
  if (!projectId || !isServerSyncEnabled() || !isProjectPatchSyncEnabled()) {
    return;
  }
  if (typeof EventSource === 'undefined') {
    return;
  }
  stopProjectSyncStream();
  activeProjectId = projectId;
  const url = projectSyncStreamUrl(projectId);
  const source = new EventSource(url);
  activeSource = source;
  const localClientId = getProjectSyncClientId();

  syncTraceLog(`sse-${projectId}`, 'sse:connecting', { projectId, url });

  source.addEventListener('project_updated', (event) => {
    try {
      const data = JSON.parse(event.data);
      const traceId = data.traceId ?? null;
      syncTraceLog(traceId, 'sse:project_updated', {
        projectId,
        revision: data.revision,
        clientId: data.clientId ?? null,
        ...summarizePatchOps(data.ops),
      });
      const revision = Number(data.revision) || 0;
      void ensureClientRevision(projectId);
      void applyRemoteProjectPatch(projectId, data.ops ?? [], revision, {
        clientId: data.clientId,
        localClientId,
        traceId,
      });
    } catch (e) {
      console.warn('SSE project_updated parse failed:', e);
    }
  });

  source.addEventListener('revision', (event) => {
    try {
      const data = JSON.parse(event.data);
      const revision = Number(data.revision) || 0;
      if (revision > 0) {
        void ensureClientRevision(projectId).then(() => {
          if (revision > getClientRevision(projectId)) {
            applyServerProjectRevision(projectId, data.updatedAt ?? null, revision);
          }
        });
      }
    } catch {
      /* ignore */
    }
  });

  source.onopen = () => {
    reconnectAttempt = 0;
    syncTraceLog(`sse-${projectId}`, 'sse:open', { projectId });
  };

  source.onerror = () => {
    syncTraceLog(`sse-${projectId}`, 'sse:error', { projectId });
    source.close();
    if (activeSource === source) {
      activeSource = null;
    }
    scheduleReconnect(projectId);
  };
}

export function stopProjectSyncStream() {
  clearReconnectTimer();
  if (activeSource && activeProjectId) {
    syncTraceLog(`sse-${activeProjectId}`, 'sse:close', { projectId: activeProjectId });
  }
  if (activeSource) {
    activeSource.close();
    activeSource = null;
  }
  activeProjectId = null;
  reconnectAttempt = 0;
}

/** @internal */
export function getActiveSyncStreamProjectId() {
  return activeProjectId;
}

/** @internal */
export function resetProjectSyncStreamForTests() {
  stopProjectSyncStream();
}
