let clientWorkspaceIndexRevision = 0;

export function getClientWorkspaceIndexRevision() {
  return clientWorkspaceIndexRevision;
}

export function applyServerWorkspaceIndexRevision(revision) {
  clientWorkspaceIndexRevision = Number(revision) || 0;
}

/** @internal */
export function resetWorkspaceIndexRevisionForTests() {
  clientWorkspaceIndexRevision = 0;
}
