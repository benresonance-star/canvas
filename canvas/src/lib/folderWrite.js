import { buildFilename } from './filename.js';
import { readFileEntry } from './readFile.js';

function splitRelativePath(path) {
  return String(path ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
}

export async function getFileHandleAtPath(handle, relativePath, options) {
  const parts = splitRelativePath(relativePath);
  if (!handle || parts.length === 0) {
    throw new DOMException('File path unavailable', 'NotFoundError');
  }
  let dir = handle;
  for (const segment of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment, { create: false });
  }
  return dir.getFileHandle(parts[parts.length - 1], options);
}

export async function ensureWritePermission(handle) {
  if (!handle) return false;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    if (perm === 'prompt') {
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

export async function writeTextFileToFolder(handle, filename, text) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  return fileHandle;
}

export async function writeUserNoteFile(handle, { prefix, name, body, version = 1 }) {
  const filename = buildFilename({ prefix, name, version, ext: 'md' });
  await writeTextFileToFolder(handle, filename, body);
  return filename;
}

export function buildBookmarkShortcutFile(url) {
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

export function buildBookmarkMarkdownFile({ title, url }) {
  const heading = String(title || 'Bookmark').trim() || 'Bookmark';
  return [
    `# ${heading}`,
    '',
    `URL: ${url}`,
    '',
  ].join('\n');
}

export function bookmarkMarkdownFilenameFromShortcut(filename) {
  return String(filename ?? '').replace(/\.url$/i, '.bookmark.md');
}

export function isBookmarkMarkdownFilename(filename) {
  return /\.bookmark\.md$/i.test(String(filename ?? ''));
}

export function isBookmarkShortcutWriteError(error) {
  return (
    error?.name === 'NotAllowedError'
    || error?.name === 'SecurityError'
    || error?.name === 'InvalidModificationError'
    || /name is not allowed/i.test(error?.message ?? '')
  );
}

export async function writeBookmarkFile(handle, { filename, url, title }) {
  if (isBookmarkMarkdownFilename(filename)) {
    await writeTextFileToFolder(
      handle,
      filename,
      buildBookmarkMarkdownFile({ title, url }),
    );
    return filename;
  }

  try {
    await writeTextFileToFolder(handle, filename, buildBookmarkShortcutFile(url));
    return filename;
  } catch (error) {
    if (!isBookmarkShortcutWriteError(error)) {
      throw error;
    }
  }
  const markdownFilename = bookmarkMarkdownFilenameFromShortcut(filename);
  await writeTextFileToFolder(
    handle,
    markdownFilename,
    buildBookmarkMarkdownFile({ title, url }),
  );
  return markdownFilename;
}

export async function overwriteTextFileAtPath(handle, relativePath, body) {
  const entry = await getFileHandleAtPath(handle, relativePath, { create: true });
  const writable = await entry.createWritable();
  await writable.write(body);
  await writable.close();
  return relativePath;
}

export async function overwriteUserNoteFile(handle, filename, body) {
  await writeTextFileToFolder(handle, filename, body);
  return filename;
}

export async function fileExistsInFolder(handle, filename) {
  try {
    await handle.getFileHandle(filename);
    return true;
  } catch (e) {
    if (e?.name === 'NotFoundError') return false;
    throw e;
  }
}

export async function removeFileFromFolder(handle, filename) {
  await handle.removeEntry(filename);
}

export async function fileExistsAtFolderPath(handle, relativePath) {
  const parts = splitRelativePath(relativePath);
  if (!handle || !parts.length) return false;
  if (parts.length === 1) {
    return fileExistsInFolder(handle, parts[0]);
  }
  try {
    await getFileHandleAtPath(handle, relativePath, { create: false });
    return true;
  } catch (e) {
    if (e?.name === 'NotFoundError') return false;
    throw e;
  }
}

export async function removeFileAtFolderPath(handle, relativePath) {
  const parts = splitRelativePath(relativePath);
  if (!handle || !parts.length) return;
  if (parts.length === 1) {
    await removeFileFromFolder(handle, parts[0]);
    return;
  }
  let dir = handle;
  for (const segment of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment, { create: false });
  }
  await dir.removeEntry(parts[parts.length - 1]);
}

/**
 * Write note to new filename (when name changes) or overwrite in place.
 * If body is omitted, content is read from the old file before removal.
 */
export async function renameUserNoteFile(handle, oldFilename, { prefix, name, version, body }) {
  const newFilename = buildFilename({ prefix, name, version, ext: 'md' });
  if (newFilename === oldFilename) {
    if (body !== undefined) {
      await overwriteUserNoteFile(handle, oldFilename, body);
    }
    return newFilename;
  }
  if (await fileExistsInFolder(handle, newFilename)) {
    return { collision: true, filename: newFilename };
  }
  let text = body;
  if (text === undefined) {
    const entry = await handle.getFileHandle(oldFilename);
    const file = await readFileEntry(entry);
    text = file.content ?? '';
  }
  await writeTextFileToFolder(handle, newFilename, text);
  await removeFileFromFolder(handle, oldFilename);
  return newFilename;
}
