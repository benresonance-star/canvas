/** @type {Set<import('express').Response>} */
const subscribers = new Set();

/**
 * @param {import('express').Response} res
 */
export function subscribeWorkspaceIndexSync(res) {
  subscribers.add(res);
}

/**
 * @param {import('express').Response} res
 */
export function unsubscribeWorkspaceIndexSync(res) {
  subscribers.delete(res);
}

/**
 * @param {string} event
 * @param {object} data
 */
export function publishWorkspaceIndexSync(event, data) {
  if (!subscribers.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(payload);
    } catch {
      subscribers.delete(res);
    }
  }
}

/** @internal tests */
export function resetWorkspaceIndexSyncHubForTests() {
  subscribers.clear();
}

/** @internal tests */
export function getWorkspaceIndexSubscriberCount() {
  return subscribers.size;
}
