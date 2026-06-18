/** Max wait for local paint during project switch before clearing loading UI. */
export const SWITCH_PAINT_TIMEOUT_MS = 20000;

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
export function withSwitchPaintTimeout(fn, ms = SWITCH_PAINT_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('switch-timeout');
        err.code = 'SWITCH_TIMEOUT';
        reject(err);
      }, ms);
    }),
  ]);
}

/**
 * Skip switch when target is already active and canvas was hydrated for that id.
 * @param {string | null | undefined} targetId
 * @param {import('react').MutableRefObject<string | null>} activeProjectIdRef
 * @param {import('react').MutableRefObject<Set<string>>} projectHydratedRef
 */
export function shouldSkipProjectSwitch(targetId, activeProjectIdRef, projectHydratedRef) {
  if (!targetId) return true;
  if (targetId !== activeProjectIdRef.current) return false;
  return projectHydratedRef.current.has(targetId);
}

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
 * First switch load returned null (seq race); retry once without switchSeq before rollback.
 */
export function shouldRetrySwitchLoad(
  loadedCards,
  targetId,
  currentActiveProjectId,
  switchSeq,
  seqNow,
) {
  if (loadedCards != null && loadedCards.length > 0) return false;
  if (targetId !== currentActiveProjectId) return false;
  if (switchSeq != null && seqNow != null && switchSeq !== seqNow) return false;
  return true;
}

/**
 * Decide whether a switch should persist the currently active project before
 * loading the target. Delete/archive flows can explicitly disable outgoing
 * commit after the old document has already been removed or made inactive.
 */
export function buildProjectSwitchCommitPlan({
  targetId,
  currentActiveProjectId,
  commitOutgoing = true,
}) {
  const reloadActiveOnly = Boolean(
    targetId && targetId === currentActiveProjectId,
  );
  return {
    reloadActiveOnly,
    outgoingProjectId:
      commitOutgoing && !reloadActiveOnly ? currentActiveProjectId ?? null : null,
  };
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
