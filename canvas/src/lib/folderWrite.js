import { buildFilename } from './filename.js';
import { readFileEntry } from './readFile.js';

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

export async function writeBookmarkFile(handle, { filename, url }) {
  await writeTextFileToFolder(handle, filename, buildBookmarkShortcutFile(url));
  return filename;
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
