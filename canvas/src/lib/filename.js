// Parse filename: "prefix__name-v3.ext" → { prefix, name, version, ext }
export function parseFilename(filename) {
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1).toLowerCase() : '';
  const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;

  const versionMatch = base.match(/^(.+?)-v(\d+)$/);
  const nameWithoutVersion = versionMatch ? versionMatch[1] : base;
  const version = versionMatch ? parseInt(versionMatch[2], 10) : 1;

  const prefixMatch = nameWithoutVersion.match(/^([^_]+)__(.+)$/);
  const prefix = prefixMatch ? prefixMatch[1] : 'general';
  const name = prefixMatch ? prefixMatch[2] : nameWithoutVersion;

  return { prefix, name, version, ext, fullBase: nameWithoutVersion };
}

export function buildFilename({ prefix, name, version = 1, ext = 'md' }) {
  const base = `${prefix}__${name}-v${version}`;
  return ext ? `${base}.${ext}` : base;
}

export function normalizeFolderRelativePath(path) {
  if (!path) return '';
  return String(path)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

export function folderPathDirname(relativePath) {
  const normalized = normalizeFolderRelativePath(relativePath);
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
}

export function folderPathBasename(relativePath) {
  const normalized = normalizeFolderRelativePath(relativePath);
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function folderKeyFromRelativePath(relativePath) {
  const normalized = normalizeFolderRelativePath(relativePath);
  if (!normalized) return '';
  const dir = folderPathDirname(normalized);
  const baseKey = parseFilename(folderPathBasename(normalized)).fullBase;
  return dir ? `${dir}/${baseKey}` : baseKey;
}

export function folderRelativePathFromVersion(version) {
  return normalizeFolderRelativePath(version?.relativePath ?? version?.path ?? version?.filename);
}

/** Canonical workspace card key (matches folder sync grouped keys). */
export function cardKeyFromFilename(filename) {
  return folderKeyFromRelativePath(filename);
}

/**
 * Normalize a card key or filename to the canonical folder-sync key.
 * @param {string | null | undefined} keyOrFilename
 */
export function toCanonicalSyncKey(keyOrFilename) {
  if (!keyOrFilename) return '';
  const s = normalizeFolderRelativePath(keyOrFilename);
  if (s.includes('.')) return folderKeyFromRelativePath(s);
  const dir = folderPathDirname(s);
  const base = folderPathBasename(s);
  const legacyVersion = base.match(/^(.+)-v(\d+)$/);
  const normalizedBase = legacyVersion ? legacyVersion[1] : base;
  return dir ? `${dir}/${normalizedBase}` : normalizedBase;
}

/** @param {string} a @param {string} b */
export function syncKeysMatch(a, b) {
  if (!a || !b) return false;
  return toCanonicalSyncKey(a) === toCanonicalSyncKey(b);
}

export function fileTypeFromExt(ext) {
  const normalizedExt = String(ext ?? '').toLowerCase();
  if (['md', 'txt'].includes(normalizedExt)) return 'markdown';
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'py'].includes(normalizedExt)) return 'code';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(normalizedExt)) return 'image';
  if (['html', 'htm'].includes(normalizedExt)) return 'html';
  if (normalizedExt === 'pdf') return 'pdf';
  if (['mp4', 'webm', 'mov'].includes(normalizedExt)) return 'video';
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(normalizedExt)) return 'audio';
  if (['xlsx', 'xls', 'csv'].includes(normalizedExt)) return 'spreadsheet';
  return 'file';
}

/** Legacy persisted cards may still use type "note" */
export function normalizeCardType(type) {
  if (type === 'note') return 'markdown';
  if (type === 'bookmark') return 'bookmark';
  if (type === 'sonic-studio') return 'sonic_studio';
  return type;
}

function cardExtFromRow(card) {
  for (const version of card?.versions ?? []) {
    if (version?.ext) return String(version.ext).toLowerCase();
    const relativePath = folderRelativePathFromVersion(version);
    if (relativePath) return parseFilename(folderPathBasename(relativePath)).ext;
  }
  return '';
}

/**
 * Card prefix from persisted row (notes__ files should edit as user_note).
 * @param {{ prefix?: string, key?: string, versions?: Array<{ filename?: string }> }} card
 */
export function cardPrefixFromRow(card) {
  if (card?.prefix) return card.prefix;
  const fn = card?.versions?.[0]?.filename;
  if (fn) return parseFilename(fn).prefix;
  const key = card?.key ?? '';
  const m = key.match(/^([^_]+)__/);
  return m ? m[1] : 'general';
}

/**
 * Loaded card type: migrate legacy markdown/note rows under notes__ to user_note.
 * @param {{ type?: string, prefix?: string, key?: string, versions?: Array<{ filename?: string }> }} card
 */
export function resolveLoadedCardType(card) {
  if (!card) return 'markdown';
  const normalized = normalizeCardType(card.type);
  if (normalized === 'user_note') return 'user_note';
  if (normalized === 'user_task') return 'user_task';
  if (normalized === 'file') {
    const extType = fileTypeFromExt(cardExtFromRow(card));
    if (extType !== 'file') return extType;
  }
  const prefix = cardPrefixFromRow(card);
  if (prefix === 'notes' && (normalized === 'markdown' || card.type === 'note')) {
    return 'user_note';
  }
  if (prefix === 'tasks' && (normalized === 'markdown' || card.type === 'note')) {
    return 'user_task';
  }
  return normalized;
}

/**
 * Cards that are stored in project JSON / primitives only — not files in the linked folder.
 * @param {{ type?: string, prefix?: string }} card
 */
export function isFolderBackedCanvasCard(card) {
  const type = normalizeCardType(card?.type);
  if (type === 'bookmark') return false;
  if (type === 'flow') return false;
  if (type === 'live') return false;
  if (type === 'agent') return false;
  if (type === 'music-agent') return false;
  if (type === 'sonic_studio') return false;
  if (card?.prefix === 'links') return false;
  return true;
}

export function cardHasNestedFolderPath(card) {
  return (card?.versions ?? []).some((version) => {
    const relativePath = folderRelativePathFromVersion(version);
    return relativePath.includes('/');
  });
}

/**
 * @param {{ key?: string, type?: string, prefix?: string, name?: string, versions?: Array<{ filename?: string }> }} card
 */
function cardCanonicalKeysForPresence(card) {
  const keys = new Set();
  if (card?.key) keys.add(toCanonicalSyncKey(card.key));
  for (const v of card.versions ?? []) {
    const relativePath = folderRelativePathFromVersion(v);
    if (relativePath) keys.add(cardKeyFromFilename(relativePath));
  }
  const prefix = card.prefix ?? '';
  const name = card.name;
  if (prefix && name) keys.add(toCanonicalSyncKey(`${prefix}__${name}`));
  return keys;
}

/**
 * @param {Set<string>} folderKeySet
 * @param {{ key?: string, versions?: Array<{ filename?: string }>, prefix?: string, name?: string }} card
 */
export function folderKeySetMatchesCard(folderKeySet, card) {
  if (!folderKeySet?.size || !card) return false;
  const cardKeys = cardCanonicalKeysForPresence(card);
  for (const fk of folderKeySet) {
    for (const ck of cardKeys) {
      if (syncKeysMatch(fk, ck)) return true;
    }
  }
  return false;
}

/**
 * Canonical keys for folder-backed artifacts on canvas and dock.
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
export function collectFolderBackedKeys(cards, stagedSyncCards) {
  const keys = new Set();
  for (const entry of [...(cards ?? []), ...(stagedSyncCards ?? [])]) {
    if (!isFolderBackedCanvasCard(entry)) continue;
    for (const k of cardCanonicalKeysForPresence(entry)) {
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

/**
 * @param {string[]} scanKeys
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
export function unionFolderPresentKeys(scanKeys, cards, stagedSyncCards) {
  const out = new Set(scanKeys ?? []);
  for (const k of collectFolderBackedKeys(cards, stagedSyncCards)) {
    out.add(k);
  }
  return [...out];
}

/**
 * True when a folder-backed card's key was absent from the last folder scan.
 * @param {{ folderConnected?: boolean, folderKeySet?: Set<string> | null, card?: { key?: string, type?: string, prefix?: string } | null }} input
 */
export function isCardMissingFromFolder({
  folderConnected = false,
  folderKeySet = null,
  card = null,
} = {}) {
  if (!folderConnected || !folderKeySet?.size || !card?.key) return false;
  if (!isFolderBackedCanvasCard(card)) return false;
  return !folderKeySetMatchesCard(folderKeySet, card);
}

/**
 * Whether note edits should persist to project JSON only (no folder file).
 * @param {{ folderHandle?: unknown, folderConnected?: boolean, folderKeySet?: Set<string> | null, card?: { key?: string, type?: string, prefix?: string } | null }} input
 */
export function noteRequiresProjectOnlySave({
  folderHandle = null,
  folderConnected = false,
  folderKeySet = null,
  card = null,
} = {}) {
  if (!folderHandle) return true;
  if (
    folderConnected
    && folderKeySet?.size
    && card?.key
    && !folderKeySetMatchesCard(folderKeySet, card)
    && isFolderBackedCanvasCard(card)
  ) {
    return true;
  }
  return false;
}

/**
 * Inline / fullscreen note fields are editable; folder sync may be project-only.
 * @param {{ folderHandle?: unknown, folderConnected?: boolean, folderKeySet?: Set<string> | null, cardKey?: string }} input
 */
export function computeUserNoteDisabled() {
  return false;
}

/** Card types that render inline markdown/text in CardPreview and modal */
export function isTextMarkdownPreviewType(type) {
  const t = normalizeCardType(type);
  return t === 'markdown' || t === 'agent_chat';
}

/** Card types that render inline plain code/text. */
export function isCodePreviewType(type) {
  return normalizeCardType(type) === 'code';
}

/** Display prefix for card headers (agent_chat uses "thread", not storage prefix "notes"). */
export function cardHeaderPrefix(card) {
  if (!card) return '';
  if (normalizeCardType(card.type) === 'agent_chat') return 'thread';
  if (normalizeCardType(card.type) === 'live') return 'live';
  if (normalizeCardType(card.type) === 'sonic_studio') return 'music';
  return card.prefix ?? '';
}

export function pinnedCardVersion(card) {
  return (card?.versions ?? []).find((version) => version.version === card?.pinnedVersion)
    ?? card?.versions?.[0];
}

export function cardFileExtension(card) {
  const pinned = pinnedCardVersion(card);
  const ext = pinned?.ext || cardExtFromRow({ versions: pinned ? [pinned] : card?.versions });
  return ext ? String(ext).toLowerCase() : '';
}

/**
 * Display filename for artifacts: logical card name plus pinned file extension.
 * @param {object} card
 * @param {{ name?: string }} [options]
 */
export function cardDisplayFilename(card, { name = card?.name } = {}) {
  const baseName = String(name ?? '').trim();
  if (!baseName) return '';
  const ext = cardFileExtension(card);
  if (!ext) return baseName;
  const suffix = `.${ext}`;
  if (baseName.toLowerCase().endsWith(suffix)) return baseName;
  return `${baseName}${suffix}`;
}

export function cardExtensionLabel(card) {
  const ext = cardFileExtension(card);
  return ext ? ext.toUpperCase() : '';
}

/** Full header line: `prefix | TYPE` */
export function cardHeaderLabel(card) {
  return [
    cardHeaderPrefix(card),
    cardTypeLabel(card.type),
  ].filter(Boolean).join(' | ');
}

/** Uppercase label for card headers */
export function cardTypeLabel(type) {
  const t = normalizeCardType(type);
  if (t === 'user_note') return 'NOTE';
  if (t === 'user_task') return 'TASK';
  if (t === 'agent_chat') return 'CHAT';
  if (t === 'code') return 'CODE';
  if (t === 'markdown') return 'MARKDOWN';
  if (t === 'image') return 'IMAGE';
  if (t === 'html') return 'HTML';
  if (t === 'pdf') return 'PDF';
  if (t === 'video') return 'VIDEO';
  if (t === 'audio') return 'AUDIO';
  if (t === 'spreadsheet') return 'EXCEL';
  if (t === 'bookmark') return 'LINK';
  if (t === 'flow') return 'EXPLORATION';
  if (t === 'live') return 'AGENT FEED';
  if (t === 'agent') return 'AGENT';
  if (t === 'music-agent') return 'BEAT';
  if (t === 'sonic_studio') return 'SONIC STUDIO';
  return 'FILE';
}
