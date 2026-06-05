/** @type {Map<string, Set<import('express').Response>>} */
const subscribersByProject = new Map();

/**
 * @param {string} projectId
 * @param {import('express').Response} res
 */
export function subscribeClusterSync(projectId, res) {
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
export function unsubscribeClusterSync(projectId, res) {
  const set = subscribersByProject.get(projectId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribersByProject.delete(projectId);
}

/**
 * @param {string | null | undefined} projectId
 * @param {string} event
 * @param {object} data
 */
export function publishClusterSync(projectId, event, data) {
  if (!projectId) return;
  const set = subscribersByProject.get(projectId);
  if (!set?.size) return;
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
export function resetClusterSyncHubForTests() {
  subscribersByProject.clear();
}

/** @internal tests */
export function getClusterSubscriberCount(projectId) {
  return subscribersByProject.get(projectId)?.size ?? 0;
}
