import { folderKeyFromRelativePath, parseFilename } from './filename.js';
import { normalizeBookmarkUrl, domainFromUrl } from './bookmarkUrl.js';
import { previewCacheKey } from './previewStore.js';
import { readFileEntry } from './readFile.js';
import { sha256HexFromString } from './ingest/hashFile.js';

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

export function isBookmarkSidecarFilename(filename) {
  return /\.bookmark\.md$/i.test(String(filename ?? ''));
}

export function parseBookmarkSidecarFilename(filename) {
  const withoutSidecar = String(filename ?? '').replace(/\.bookmark\.md$/i, '');
  const parsed = parseFilename(`${withoutSidecar}.url`);
  return {
    ...parsed,
    ext: 'bookmark.md',
  };
}

export function parseBookmarkSidecarContent(content) {
  const text = String(content ?? '');
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const rawUrl = text.match(/^URL:\s*(.+)$/mi)?.[1]?.trim() ?? '';
  const url = normalizeBookmarkUrl(rawUrl);
  if (!url) return null;
  return {
    title,
    url,
    domain: domainFromUrl(url),
  };
}

function buildBookmarkPreviewState(bookmark, preview) {
  const domain = preview?.domain || bookmark.domain || domainFromUrl(bookmark.url);
  return {
    title: bookmark.title || preview?.title || domain,
    description: preview?.description ?? null,
    imageUrl: preview?.imageUrl ?? null,
    siteName: preview?.siteName || domain,
    faviconUrl: preview?.faviconUrl ?? null,
    domain,
    fetchedAt: new Date().toISOString(),
  };
}

async function readBookmarkSidecarEntry(entry, { relativePath, fetchBookmarkPreview } = {}) {
  const file =
    typeof entry?.getFile === 'function'
      ? await entry.getFile()
      : entry;
  if (!file) throw new Error('Bookmark file entry unavailable');
  const filename = entry.name ?? file.name;
  const content = await file.text();
  const bookmark = parseBookmarkSidecarContent(content);
  if (!bookmark) return null;
  const parsed = parseBookmarkSidecarFilename(filename);
  const normalizedPath = String(relativePath ?? filename).replace(/\\/g, '/');
  const dir = normalizedPath.includes('/')
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
    : '';
  const cardKey = dir ? `${dir}/${parsed.fullBase}` : parsed.fullBase;
  let preview = null;
  if (typeof fetchBookmarkPreview === 'function') {
    try {
      preview = await fetchBookmarkPreview(bookmark.url);
    } catch {
      preview = null;
    }
  }
  const bookmarkPreview = buildBookmarkPreviewState(bookmark, preview);
  return {
    filename,
    relativePath,
    cardKey,
    content,
    content_hash: await sha256HexFromString(bookmark.url),
    size: file.size,
    lastModified: file.lastModified,
    dataUrl: null,
    objectUrl: null,
    inline: true,
    previewStripped: false,
    previewCacheKey: null,
    prefix: parsed.prefix,
    name: parsed.name,
    fullBase: parsed.fullBase,
    version: parsed.version,
    ext: parsed.ext,
    cardType: 'bookmark',
    externalUrl: bookmark.url,
    bookmarkPreview,
    artifactSyncState: 'pending',
  };
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
 *   fetchBookmarkPreview?: (url: string) => Promise<object>,
 * }} [options]
 */
export async function scanFolderFiles(handle, options = {}) {
  const {
    projectId = null,
    isStale = () => false,
    maxDepth = DEFAULT_FOLDER_SCAN_MAX_DEPTH,
    maxFiles = DEFAULT_FOLDER_SCAN_MAX_FILES,
    fetchBookmarkPreview = null,
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
      // Generated flow snapshots mirror database state and must never be
      // re-ingested as ordinary file artifacts.
      if (/\.flow\.json$/i.test(filename)) continue;
      const relativePath =
        entry.webkitRelativePath && typeof entry.webkitRelativePath === 'string'
          ? entry.webkitRelativePath
          : joinRelativePath(parentPath, filename);
      if (isBookmarkSidecarFilename(filename)) {
        const bookmark = await readBookmarkSidecarEntry(entry, {
          relativePath,
          fetchBookmarkPreview,
        });
        if (bookmark) found.push(bookmark);
        continue;
      }
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
