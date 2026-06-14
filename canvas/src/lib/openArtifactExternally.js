import { getPreview } from './previewStore.js';
import { folderRelativePathFromVersion } from './filename.js';
import { getFileHandleAtPath } from './folderWrite.js';

const MIME_BY_EXT = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const HTML_EXT = new Set(['html', 'htm']);

/** Blob types that should open via direct navigation (no noopener Save-As quirks). */
const DIRECT_TAB_EXT = new Set([...IMAGE_EXT, ...HTML_EXT]);

const VIEWABLE_IN_TAB = new Set([
  'pdf',
  'mp4',
  'webm',
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'aac',
  'flac',
  ...DIRECT_TAB_EXT,
]);

const DESKTOP_APP_EXT = new Set(['xlsx', 'xls', 'csv', 'doc', 'docx', 'ppt', 'pptx']);

export function mimeFromExt(ext) {
  if (!ext) return '';
  return MIME_BY_EXT[ext.toLowerCase()] || '';
}

export function extFromVersion(version) {
  if (!version) return '';
  if (version.ext) return String(version.ext).toLowerCase();
  const name = version.filename || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

async function tryWebShare(file) {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    return false;
  }
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (err) {
    if (err?.name === 'AbortError') return true;
    return false;
  }
}

function openBlobInNewTab(url) {
  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}

/**
 * Open blob in a new tab (images, HTML). Single navigation only — do not combine
 * window.open with an anchor fallback; browsers may open the tab then return null
 * from window.open, which caused a duplicate tab.
 */
function openBlobDirectInNewTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

async function fileFromPreviewCache(version) {
  if (!version.previewCacheKey) return null;
  const blob = await getPreview(version.previewCacheKey);
  if (!blob) return null;
  const ext = extFromVersion(version);
  const mime = blob.type || mimeFromExt(ext) || 'application/octet-stream';
  const name = version.filename || `file.${ext || 'bin'}`;
  return new File([blob], name, { type: mime });
}

async function resolveArtifactFile({ folderHandle, version }) {
  if (!version) return null;

  if (folderHandle && version.filename) {
    try {
      const entry = await getFileHandleAtPath(
        folderHandle,
        folderRelativePathFromVersion(version),
      );
      const file = await entry.getFile();
      const ext = extFromVersion(version);
      const mime = file.type || mimeFromExt(ext);
      if (!mime) return file;
      return new File([file], file.name, { type: mime });
    } catch (err) {
      if (err?.name !== 'NotFoundError') throw err;
    }
  }

  const src = version.objectUrl || version.dataUrl;
  if (src) {
    const res = await fetch(src);
    const blob = await res.blob();
    const ext = extFromVersion(version);
    const mime = blob.type || mimeFromExt(ext) || 'application/octet-stream';
    const name = version.filename || `file.${ext || 'bin'}`;
    return new File([blob], name, { type: mime });
  }

  const ext = extFromVersion(version);
  if (
    HTML_EXT.has(ext) &&
    version.content != null &&
    version.content !== ''
  ) {
    const name = version.filename || `file.${ext}`;
    return new File([version.content], name, { type: 'text/html' });
  }

  return fileFromPreviewCache(version);
}

/**
 * Hand off to OS without triggering Save-As. Never uses <a download>.
 */
async function handoffFileToOs(file, version) {
  const ext = extFromVersion(version);
  const isDesktopApp = DESKTOP_APP_EXT.has(ext);
  const isViewableInTab = VIEWABLE_IN_TAB.has(ext);

  if (isDesktopApp && (await tryWebShare(file))) {
    return { ok: true, method: 'share' };
  }

  if (isViewableInTab || isDesktopApp) {
    const url = URL.createObjectURL(file);
    const opened = DIRECT_TAB_EXT.has(ext)
      ? openBlobDirectInNewTab(url)
      : openBlobInNewTab(url);
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    if (opened) {
      return { ok: true, method: 'tab' };
    }
    if (isDesktopApp) {
      return { ok: false, reason: 'use_desktop' };
    }
    return { ok: false, reason: 'popup_blocked' };
  }

  const url = URL.createObjectURL(file);
  const opened = openBlobInNewTab(url);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  if (opened) return { ok: true, method: 'tab' };
  return { ok: false, reason: 'popup_blocked' };
}

export function canOpenBookmarkExternally(version) {
  return Boolean(version?.externalUrl);
}

export function openBookmarkExternally(version) {
  const url = version?.externalUrl;
  if (!url) return { ok: false, error: 'unavailable' };
  const opened = openBlobDirectInNewTab(url);
  return opened ? { ok: true, method: 'tab' } : { ok: false, error: 'popup_blocked' };
}

export function canOpenArtifactExternally({ folderHandle, version, missingFromFolder, cardType }) {
  if (!version) return false;
  if (cardType === 'bookmark' || version.externalUrl) {
    return canOpenBookmarkExternally(version);
  }
  if (missingFromFolder) return false;
  if (version.filename) return true;
  return Boolean(version.objectUrl || version.dataUrl || version.previewCacheKey);
}

/**
 * @returns {Promise<{ ok: true, method?: string } | { ok: false, error: string, folderName?: string, filename?: string }>}
 */
export async function openArtifactExternally({ folderHandle, version, cardType }) {
  if (!version) return { ok: false, error: 'unavailable' };

  if (cardType === 'bookmark' || version.externalUrl) {
    return openBookmarkExternally(version);
  }

  const ext = extFromVersion(version);
  const fromConnectedFolder = Boolean(folderHandle && version.filename);

  try {
    const file = await resolveArtifactFile({ folderHandle, version });
    if (!file) {
      if (version.filename && !folderHandle) {
        return { ok: false, error: 'reconnect_folder' };
      }
      return { ok: false, error: 'unavailable' };
    }

    const handoff = await handoffFileToOs(file, version);

    if (handoff.ok) {
      return { ok: true, method: handoff.method };
    }

    if (handoff.reason === 'use_desktop' && fromConnectedFolder && DESKTOP_APP_EXT.has(ext)) {
      return {
        ok: false,
        error: 'use_folder',
        folderName: folderHandle.name,
        filename: version.filename,
      };
    }

    if (handoff.reason === 'popup_blocked') {
      return { ok: false, error: 'popup_blocked' };
    }

    return { ok: false, error: 'failed' };
  } catch (err) {
    if (err?.name === 'NotFoundError') return { ok: false, error: 'not_found' };
    return { ok: false, error: 'failed' };
  }
}
