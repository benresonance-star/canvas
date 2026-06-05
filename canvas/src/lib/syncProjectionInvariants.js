import { pickAuthoritativeProjectDisplayName } from './projectDisplayName.js';

/**
 * Pure projection/sync invariant helpers for menu, canvas, and revision alignment.
 * Used by tests and documented in AGENTS.md (I1–I5).
 */

/**
 * Menu/canvas effective project id (matches CanvasWorkspaceView).
 * @param {string | null | undefined} pendingSwitchProjectId
 * @param {string | null | undefined} activeProjectId
 * @returns {string | null}
 */
export function getEffectiveProjectId(pendingSwitchProjectId, activeProjectId) {
  return pendingSwitchProjectId ?? activeProjectId ?? null;
}

/**
 * I1 — During switch, effective id must track pending target; when settled, effective === active.
 * @param {string | null | undefined} pendingSwitchProjectId
 * @param {string | null | undefined} activeProjectId
 */
export function isEffectiveProjectIdConsistent(pendingSwitchProjectId, activeProjectId) {
  const effective = getEffectiveProjectId(pendingSwitchProjectId, activeProjectId);
  if (pendingSwitchProjectId != null) {
    return effective === pendingSwitchProjectId;
  }
  return effective === (activeProjectId ?? null);
}

/**
 * I1 — Settled selection: no in-flight switch; React active matches durable index when index is known.
 * @param {{
 *   pendingSwitchProjectId?: string | null;
 *   activeProjectId?: string | null;
 *   indexActiveProjectId?: string | null;
 * }} params
 */
export function isSelectionProjectionSettled({
  pendingSwitchProjectId,
  activeProjectId,
  indexActiveProjectId,
}) {
  if (pendingSwitchProjectId != null) return false;
  if (!activeProjectId) return indexActiveProjectId == null;
  if (indexActiveProjectId == null) return true;
  return activeProjectId === indexActiveProjectId;
}

/**
 * I1 — After successful load, hydrated document id should match effective selection when settled.
 * @param {string | null | undefined} loadedProjectId
 * @param {string | null | undefined} pendingSwitchProjectId
 * @param {string | null | undefined} activeProjectId
 */
export function isLoadedProjectAlignedWithSelection(
  loadedProjectId,
  pendingSwitchProjectId,
  activeProjectId,
) {
  const effective = getEffectiveProjectId(pendingSwitchProjectId, activeProjectId);
  if (!effective) return loadedProjectId == null;
  return loadedProjectId === effective;
}

/**
 * I1 — Header title aligned with menu selection (projectList row for effective id).
 * @param {{
 *   projectList?: Array<{ id?: string; name?: string }> | null;
 *   effectiveProjectId?: string | null;
 *   committedProjectId?: string | null;
 *   stateProjectName?: string | null;
 *   projectNameDirty?: boolean;
 *   defaultName?: string;
 * }} params
 */
export function resolveHeaderProjectName({
  projectList,
  effectiveProjectId,
  committedProjectId = null,
  stateProjectName,
  projectNameDirty = false,
  defaultName = 'Untitled Project',
}) {
  if (projectNameDirty) {
    return stateProjectName?.trim() || defaultName;
  }
  const lookupId = effectiveProjectId ?? committedProjectId ?? null;
  if (lookupId == null) {
    return defaultName;
  }
  const row = projectList?.find((p) => p.id === lookupId);
  return pickAuthoritativeProjectDisplayName(
    row?.name,
    stateProjectName,
    defaultName,
  );
}

/**
 * Keeps activeProjectIdRef aligned with selection without clearing in-flight load targets.
 * @param {{
 *   effectiveProjectId?: string | null;
 *   committedProjectId?: string | null;
 *   pendingProjectId?: string | null;
 *   projectSwitchLoading?: boolean;
 *   switchingProject?: boolean;
 *   currentRef?: string | null;
 * }} params
 */
export function resolveActiveProjectIdRefSync({
  effectiveProjectId = null,
  committedProjectId = null,
  pendingProjectId = null,
  projectSwitchLoading = false,
  switchingProject = false,
  currentRef = null,
}) {
  const inFlight =
    projectSwitchLoading
    || switchingProject
    || pendingProjectId != null;
  if (inFlight) {
    return effectiveProjectId ?? currentRef ?? null;
  }
  return effectiveProjectId ?? committedProjectId ?? null;
}

/**
 * True when header text matches menu selection name (case-insensitive trim).
 */
export function isHeaderAlignedWithMenuSelection(
  headerName,
  projectList,
  effectiveProjectId,
) {
  if (!effectiveProjectId) return true;
  const row = projectList?.find((p) => p.id === effectiveProjectId);
  const expected = row?.name?.trim();
  if (!expected) return true;
  return headerName?.trim().toLowerCase() === expected.toLowerCase();
}

/**
 * I4 — Menu list contains a row for the active project id.
 * @param {Array<{ id?: string }> | null | undefined} projectList
 * @param {string | null | undefined} activeProjectId
 */
export function indexRowMatchesActiveProject(projectList, activeProjectId) {
  if (!activeProjectId) return true;
  return Boolean(projectList?.some((row) => row?.id === activeProjectId));
}

/**
 * I5 — Switch handler still owns the UI (no newer switch started).
 * @param {number} switchSeq
 * @param {number} seqNow
 */
export function switchStillCurrent(switchSeq, seqNow) {
  return switchSeq === seqNow;
}

/**
 * I5 — Only roll back workspace when this switch is still current.
 * @param {number} switchSeq
 * @param {number} seqNow
 */
export function shouldRestoreWorkspaceOnSwitchFailure(switchSeq, seqNow) {
  return switchStillCurrent(switchSeq, seqNow);
}

/**
 * I3 — Accept inbound server revision when missing client revision or server is newer/equal.
 * @param {number | null | undefined} clientRevision
 * @param {number | null | undefined} incomingRevision
 */
export function shouldAcceptIncomingRevision(clientRevision, incomingRevision) {
  if (incomingRevision == null || Number.isNaN(incomingRevision)) return false;
  if (clientRevision == null || Number.isNaN(clientRevision)) return true;
  return incomingRevision >= clientRevision;
}

/**
 * I3 — Reject strictly older inbound revisions.
 * @param {number | null | undefined} clientRevision
 * @param {number | null | undefined} incomingRevision
 */
export function isStaleIncomingRevision(clientRevision, incomingRevision) {
  return !shouldAcceptIncomingRevision(clientRevision, incomingRevision);
}

/**
 * Dev-oriented snapshot shape for trace tables (no DOM).
 * @param {{
 *   pendingSwitchProjectId?: string | null;
 *   activeProjectId?: string | null;
 *   indexActiveProjectId?: string | null;
 *   loadedProjectId?: string | null;
 *   clientRevision?: number | null;
 *   projectName?: string | null;
 *   cardCount?: number;
 * }} params
 */
/**
 * Derive workspace lifecycle phase from shell state.
 * @param {{
 *   loaded?: boolean;
 *   projectListLength?: number;
 *   pendingSwitchProjectId?: string | null;
 *   projectSwitchLoading?: boolean;
 *   committedProjectId?: string | null;
 * }} params
 * @returns {'idle' | 'selecting' | 'ready' | 'noProjects'}
 */
export function deriveProjectPhase({
  loaded = false,
  projectListLength = 0,
  pendingSwitchProjectId = null,
  projectSwitchLoading = false,
  committedProjectId = null,
}) {
  if (!loaded) return 'idle';
  if (projectListLength === 0) return 'noProjects';
  if (pendingSwitchProjectId != null || projectSwitchLoading) return 'selecting';
  if (committedProjectId) return 'ready';
  return 'idle';
}

/**
 * @param {{
 *   phase?: string;
 *   effectiveProjectId?: string | null;
 *   committedProjectId?: string | null;
 *   hydrated?: boolean;
 * }} projection
 */
export function canMutateCanvas(projection) {
  const {
    phase = 'idle',
    effectiveProjectId = null,
    committedProjectId = null,
    hydrated = false,
  } = projection ?? {};
  return (
    phase === 'ready'
    && Boolean(effectiveProjectId)
    && effectiveProjectId === committedProjectId
    && hydrated
  );
}

/**
 * Empty workspace UX gates (unified with Phase 2 plan).
 * @param {{
 *   projectListLength?: number;
 *   committedProjectId?: string | null;
 *   phase?: string;
 * }} params
 */
export function canShowEmptyWorkspace({
  projectListLength = 0,
  committedProjectId = null,
  phase = 'idle',
}) {
  return projectListLength === 0;
}

export function shouldShowSelectProjectPrompt({
  projectListLength = 0,
  committedProjectId = null,
  phase = 'idle',
}) {
  return (
    projectListLength > 0
    && !committedProjectId
    && phase !== 'selecting'
  );
}

/**
 * Dev assert for projection consistency (I1–I6 subset).
 * @param {object} projection
 * @returns {{ ok: boolean; violations: string[] }}
 */
export function assertProjectionConsistent(projection) {
  const violations = [];
  const {
    pendingProjectId = null,
    committedProjectId = null,
    effectiveProjectId = null,
    phase = 'idle',
    hydrated = false,
    canMutateCanvas: canMutate = false,
  } = projection ?? {};

  if (!isEffectiveProjectIdConsistent(pendingProjectId, committedProjectId)) {
    violations.push('effective_id_mismatch');
  }
  if (canMutate && phase !== 'ready') {
    violations.push('mutate_while_not_ready');
  }
  if (canMutate && effectiveProjectId !== committedProjectId) {
    violations.push('mutate_while_ids_diverged');
  }
  if (canMutate && !hydrated) {
    violations.push('mutate_while_not_hydrated');
  }
  return { ok: violations.length === 0, violations };
}

export function buildProjectionSnapshot(params) {
  const {
    pendingSwitchProjectId = null,
    activeProjectId = null,
    indexActiveProjectId = null,
    loadedProjectId = null,
    clientRevision = null,
    projectName = null,
    cardCount = 0,
  } = params;
  const effectiveProjectId = getEffectiveProjectId(pendingSwitchProjectId, activeProjectId);
  const phase = deriveProjectPhase({
    loaded: true,
    projectListLength: params.projectListLength ?? 1,
    pendingSwitchProjectId,
    projectSwitchLoading: params.projectSwitchLoading ?? false,
    committedProjectId: activeProjectId,
  });
  const projection = {
    phase,
    effectiveProjectId,
    committedProjectId: activeProjectId,
    pendingProjectId: pendingSwitchProjectId,
    hydrated: Boolean(
      effectiveProjectId && loadedProjectId === effectiveProjectId,
    ),
  };
  return {
    effectiveProjectId,
    pendingSwitchProjectId,
    activeProjectId,
    indexActiveProjectId,
    loadedProjectId,
    clientRevision,
    projectName,
    cardCount,
    phase,
    canMutateCanvas: canMutateCanvas(projection),
    selectionSettled: isSelectionProjectionSettled({
      pendingSwitchProjectId,
      activeProjectId,
      indexActiveProjectId,
    }),
    effectiveConsistent: isEffectiveProjectIdConsistent(
      pendingSwitchProjectId,
      activeProjectId,
    ),
    loadAligned: isLoadedProjectAlignedWithSelection(
      loadedProjectId,
      pendingSwitchProjectId,
      activeProjectId,
    ),
  };
}
