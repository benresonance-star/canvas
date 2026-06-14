import { folderKeyFromRelativePath, parseFilename } from './filename.js';
import { previewCacheKey } from './previewStore.js';
import { readFileEntry } from './readFile.js';

export const DEFAULT_FOLDER_SCAN_MAX_DEPTH = 8;
export const DEFAULT_FOLDER_SCAN_MAX_FILES = 2000;

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.DS_Store',
  'node_modules',
  'dist',
  'build',
]);

function shouldIgnoreDirectory(name) {
  if (!name) return true;
  if (IGNORED_DIRECTORY_NAMES.has(name)) return true;
  return name.startsWith('.');
}

function joinRelativePath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name;
}

/**
 * Walk a linked project folder and read artifacts with root-compatible keys.
 *
 * Root files keep their historical card keys (`notes__x`). Nested files use
 * their folder path without the version suffix (`docs/notes__x`).
 *
 * @param {FileSystemDirectoryHandle | { values(): AsyncIterable<unknown> }} handle
 * @param {{
 *   projectId?: string | null,
 *   isStale?: () => boolean,
 *   maxDepth?: number,
 *   maxFiles?: number,
 * }} [options]
 */
export async function scanFolderFiles(handle, options = {}) {
  const {
    projectId = null,
    isStale = () => false,
    maxDepth = DEFAULT_FOLDER_SCAN_MAX_DEPTH,
    maxFiles = DEFAULT_FOLDER_SCAN_MAX_FILES,
  } = options;
  const found = [];

  async function visitDirectory(directoryHandle, parentPath, depth) {
    if (isStale() || depth > maxDepth || found.length >= maxFiles) return;
    for await (const entry of directoryHandle.values()) {
      if (isStale() || found.length >= maxFiles) break;
      const kind = entry?.kind;
      if (kind === 'directory') {
        if (!shouldIgnoreDirectory(entry.name)) {
          await visitDirectory(entry, joinRelativePath(parentPath, entry.name), depth + 1);
        }
        continue;
      }
      if (kind && kind !== 'file') continue;

      const filename = entry.name;
      if (!filename) continue;
      const relativePath =
        entry.webkitRelativePath && typeof entry.webkitRelativePath === 'string'
          ? entry.webkitRelativePath
          : joinRelativePath(parentPath, filename);
      const parsed = parseFilename(filename);
      const cardKey = folderKeyFromRelativePath(relativePath);
      const cacheKey = projectId
        ? previewCacheKey(projectId, cardKey, parsed.version)
        : null;
      const file = await readFileEntry(entry, { cacheKey, relativePath });
      found.push({
        ...file,
        filename,
        relativePath,
        cardKey,
      });
    }
  }

  await visitDirectory(handle, '', 0);
  return {
    found,
    truncated: found.length >= maxFiles,
  };
}
