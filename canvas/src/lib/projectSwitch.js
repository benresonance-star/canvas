/**
 * Returns true when an async project load should still be applied to React state.
 */
export function shouldApplyProjectLoad(
  requestedProjectId,
  currentActiveProjectId,
  seqAtStart,
  seqNow,
) {
  if (!requestedProjectId) return false;
  if (requestedProjectId !== currentActiveProjectId) return false;
  if (seqAtStart != null && seqNow != null && seqAtStart !== seqNow) return false;
  return true;
}

/**
 * Empty canvas state shown immediately when switching projects (avoids showing prior project cards).
 * @param {{ name?: string } | null | undefined} indexRow
 * @param {string} defaultProjectName
 */
export function buildSwitchPlaceholderState(indexRow, defaultProjectName) {
  return {
    projectName: indexRow?.name?.trim() || defaultProjectName,
    cards: [],
  };
}
