const sessionRevisionByKey = new Map();
const threadIndexRevisionByKey = new Map();

function sessionKey(projectId, connectorId, threadId) {
  return `${projectId}|${connectorId}|${threadId ?? 'legacy'}`;
}

function threadIndexKey(projectId, connectorId) {
  return `${projectId}|${connectorId}`;
}

export function getAgentChatSessionRevision(projectId, connectorId, threadId) {
  return sessionRevisionByKey.get(sessionKey(projectId, connectorId, threadId)) ?? 0;
}

export function setAgentChatSessionRevision(projectId, connectorId, threadId, revision) {
  sessionRevisionByKey.set(
    sessionKey(projectId, connectorId, threadId),
    Number(revision) || 0,
  );
}

export function getAgentChatThreadIndexRevision(projectId, connectorId) {
  return threadIndexRevisionByKey.get(threadIndexKey(projectId, connectorId)) ?? 0;
}

export function setAgentChatThreadIndexRevision(projectId, connectorId, revision) {
  threadIndexRevisionByKey.set(
    threadIndexKey(projectId, connectorId),
    Number(revision) || 0,
  );
}

/** @internal */
export function resetAgentChatRevisionsForTests() {
  sessionRevisionByKey.clear();
  threadIndexRevisionByKey.clear();
}
