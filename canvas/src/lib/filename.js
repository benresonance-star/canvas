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

/** Canonical workspace card key (matches folder sync grouped keys). */
export function cardKeyFromFilename(filename) {
  return parseFilename(filename).fullBase;
}

/**
 * Normalize a card key or filename to the canonical folder-sync key.
 * @param {string | null | undefined} keyOrFilename
 */
export function toCanonicalSyncKey(keyOrFilename) {
  if (!keyOrFilename) return '';
  const s = String(keyOrFilename);
  if (s.includes('.')) return parseFilename(s).fullBase;
  const legacyVersion = s.match(/^(.+)-v(\d+)$/);
  return legacyVersion ? legacyVersion[1] : s;
}

/** @param {string} a @param {string} b */
export function syncKeysMatch(a, b) {
  if (!a || !b) return false;
  return toCanonicalSyncKey(a) === toCanonicalSyncKey(b);
}

export function fileTypeFromExt(ext) {
  if (['md', 'txt'].includes(ext)) return 'markdown';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet';
  return 'file';
}

/** Legacy persisted cards may still use type "note" */
export function normalizeCardType(type) {
  if (type === 'note') return 'markdown';
  if (type === 'bookmark') return 'bookmark';
  return type;
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
  const prefix = cardPrefixFromRow(card);
  if (prefix === 'notes' && (normalized === 'markdown' || card.type === 'note')) {
    return 'user_note';
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
  if (card?.prefix === 'links') return false;
  return true;
}

/**
 * @param {{ key?: string, type?: string, prefix?: string, name?: string, versions?: Array<{ filename?: string }> }} card
 */
function cardCanonicalKeysForPresence(card) {
  const keys = new Set();
  if (card?.key) keys.add(toCanonicalSyncKey(card.key));
  for (const v of card.versions ?? []) {
    if (v?.filename) keys.add(cardKeyFromFilename(v.filename));
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
  if (!folderConnected || !folderKeySet || !card?.key) return false;
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
    && folderKeySet
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

/** Display prefix for card headers (agent_chat uses "thread", not storage prefix "notes"). */
export function cardHeaderPrefix(card) {
  if (!card) return '';
  if (normalizeCardType(card.type) === 'agent_chat') return 'thread';
  return card.prefix ?? '';
}

/** Full header line: `prefix | TYPE` */
export function cardHeaderLabel(card) {
  return `${cardHeaderPrefix(card)} | ${cardTypeLabel(card.type)}`;
}

/** Uppercase label for card headers */
export function cardTypeLabel(type) {
  const t = normalizeCardType(type);
  if (t === 'user_note') return 'NOTE';
  if (t === 'agent_chat') return 'CHAT';
  if (t === 'markdown') return 'MARKDOWN';
  if (t === 'image') return 'IMAGE';
  if (t === 'html') return 'HTML';
  if (t === 'pdf') return 'PDF';
  if (t === 'video') return 'VIDEO';
  if (t === 'audio') return 'AUDIO';
  if (t === 'spreadsheet') return 'EXCEL';
  if (t === 'bookmark') return 'LINK';
  return 'FILE';
}
