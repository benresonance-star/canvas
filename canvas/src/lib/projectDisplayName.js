import { strings } from '../content/strings.js';

/**
 * True when the name is empty or the workspace default (e.g. new "Untitled Project").
 */
export function isDefaultProjectDisplayName(
  name,
  defaultName = strings.defaultProjectName,
) {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  if (trimmed === defaultName) return true;
  return trimmed.toLowerCase() === defaultName.toLowerCase();
}

/**
 * Canonical display name for a project — workspace index row only (DB: canvas_workspace_index).
 * @param {object | null | undefined} index
 * @param {string} projectId
 * @param {string} [defaultName]
 */
export function resolveProjectDisplayName(
  index,
  projectId,
  defaultName = strings.defaultProjectName,
) {
  const row = index?.projects?.find((p) => p.id === projectId);
  const name = row?.name?.trim();
  if (name) return name;
  return defaultName;
}

/**
 * Name used when creating a project document payload (mirror of index, not a second source).
 */
export function projectNameForDocumentPayload(index, projectId, defaultName) {
  return resolveProjectDisplayName(index, projectId, defaultName);
}

/**
 * Pick the visible title when index row and React state disagree.
 * Index wins when it has a non-default name; stale index "Untitled" must not hide a custom state title.
 */
export function pickAuthoritativeProjectDisplayName(
  indexName,
  stateName,
  defaultName = strings.defaultProjectName,
) {
  const fromIndex = indexName?.trim() || '';
  const fromState = stateName?.trim() || '';
  if (!fromIndex && !fromState) return defaultName;
  if (!fromIndex) return fromState;
  if (!fromState) return fromIndex;
  if (
    isDefaultProjectDisplayName(fromIndex, defaultName)
    && !isDefaultProjectDisplayName(fromState, defaultName)
  ) {
    return fromState;
  }
  return fromIndex;
}

/**
 * Whether index-driven title sync should overwrite React state.projectName.
 * Prevents periodic index poll from clobbering a visible custom title with default.
 */
export function shouldSyncIndexNameToState(
  indexDisplayName,
  stateProjectName,
  defaultName = strings.defaultProjectName,
) {
  const fromState = stateProjectName?.trim();
  if (!fromState) return true;
  const picked = pickAuthoritativeProjectDisplayName(
    indexDisplayName,
    stateProjectName,
    defaultName,
  );
  const indexTrim = indexDisplayName?.trim() || defaultName;
  return picked === indexTrim;
}
