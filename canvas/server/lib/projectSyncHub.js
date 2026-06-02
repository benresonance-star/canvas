import { syncTraceLog } from '../../src/lib/sync/syncTrace.js';

/** @type {Map<string, Set<import('express').Response>>} */
const subscribersByProject = new Map();

/**
 * @param {string} projectId
 * @param {import('express').Response} res
 */
export function subscribeProjectSync(projectId, res) {
  if (!projectId) return;
  let set = subscribersByProject.get(projectId);
  if (!set) {
    set = new Set();
    subscribersByProject.set(projectId, set);
  }
  set.add(res);
}

/**
 * @param {string} projectId
 * @param {import('express').Response} res
 */
export function unsubscribeProjectSync(projectId, res) {
  const set = subscribersByProject.get(projectId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribersByProject.delete(projectId);
}

/**
 * @param {string} projectId
 * @param {string} event
 * @param {object} data
 */
export function publishProjectSync(projectId, event, data) {
  const set = subscribersByProject.get(projectId);
  if (!set?.size) {
    syncTraceLog(data?.traceId, 'hub:publish-no-subscribers', { projectId, event });
    return;
  }
  syncTraceLog(data?.traceId, 'hub:publish', {
    projectId,
    event,
    subscriberCount: set.size,
  });
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

/** @internal tests */
export function resetProjectSyncHubForTests() {
  subscribersByProject.clear();
}

/** @internal tests */
export function getSubscriberCount(projectId) {
  return subscribersByProject.get(projectId)?.size ?? 0;
}
