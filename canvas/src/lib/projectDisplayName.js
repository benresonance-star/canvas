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
