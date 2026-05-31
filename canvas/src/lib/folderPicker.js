/**
 * Stable picker id per project (Chrome remembers last directory per id on same origin).
 * @param {string} projectId
 */
export function folderPickerId(projectId) {
  return `canvas-folder-${projectId}`;
}

/**
 * Options for showDirectoryPicker with optional stable id when supported.
 * @param {string} projectId
 * @returns {{ mode: 'readwrite', id?: string }}
 */
export function buildDirectoryPickerOptions(projectId) {
  const options = { mode: 'readwrite' };
  if (projectId) {
    options.id = folderPickerId(projectId);
  }
  return options;
}
