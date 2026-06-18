import { cardTypeFromSync } from './ingest/artifactType.js';
import {
  cardKeyFromFilename,
  cardPrefixFromRow,
  folderRelativePathFromVersion,
  normalizeCardType,
  syncKeysMatch,
  toCanonicalSyncKey,
} from './filename.js';
import { getDefaultAudioSkinColor } from './audioSkin.js';
import { getCardPixelSize } from './cards.js';
import {
  mergeDiskPreviewIntoCardVersions,
  shouldRefreshVersionFromDisk,
} from './sync.js';
import { normalizeBookmarkUrl } from './bookmarkUrl.js';

/**
 * @param {{ key: string, group: { parsed: { ext: string, prefix: string, name: string }, versions: unknown[] } }} change
 */
export function buildStagedSyncCardFromChange(change) {
  const type = cardTypeFromSync({
    ext: change.group.parsed.ext,
    prefix: change.group.parsed.prefix,
    name: change.group.parsed.name,
  });
  const defaultSkin = type === 'audio' ? getDefaultAudioSkinColor() : null;
  return {
    stagingId: crypto.randomUUID(),
    key: change.key,
    ...(change.group.versions?.[0]?.relativePath
      ? {
          relativePath: change.group.versions[0].relativePath,
          folderPath: change.group.versions[0].relativePath,
        }
      : {}),
    prefix: change.group.parsed.prefix,
    name: change.group.parsed.name,
    type,
    versions: change.group.versions,
    pinnedVersion: change.group.versions[0].version,
    ...(defaultSkin ? { audioSkinColor: defaultSkin } : {}),
  };
}

/**
 * @param {Array<{ key: string }>} cards
 * @param {{ key: string }} card
 */
export function appendCardIfKeyAbsent(cards, card) {
  if (cards.some((c) => syncKeysMatch(c.key, card.key))) return cards;
  return [...cards, card];
}

/**
 * @param {Array<{ key: string }>} stagedCards
 * @param {Array<{ key: string }>} newlyStaged
 */
export function mergeNewlyStaged(stagedCards, newlyStaged) {
  return newlyStaged.reduce(
    (acc, staged) => appendCardIfKeyAbsent(acc, staged),
    stagedCards,
  );
}

/**
 * @param {{ key?: string, prefix?: string, name?: string, versions?: Array<{ filename?: string }> }} entry
 */
function canonicalKeyForSyncEntry(entry) {
  if (!entry) return '';
  for (const v of entry.versions ?? []) {
    const relativePath = folderRelativePathFromVersion(v);
    if (relativePath) return cardKeyFromFilename(relativePath);
  }
  return toCanonicalSyncKey(entry.key);
}

export function bookmarkUrlForSyncEntry(entry) {
  for (const version of entry?.versions ?? []) {
    const normalized = normalizeBookmarkUrl(version?.externalUrl);
    if (normalized) return normalized;
  }
  return '';
}

function bookmarkUrlForFolderGroup(group) {
  for (const version of group?.versions ?? []) {
    const normalized = normalizeBookmarkUrl(version?.externalUrl);
    if (normalized) return normalized;
  }
  return '';
}

/**
 * @param {{ key?: string, prefix?: string, name?: string, versions?: Array<{ filename?: string }> }} entry
 * @param {string} folderKey
 */
function entryMatchesFolderKey(entry, folderKey) {
  if (!entry || !folderKey) return false;
  if (syncKeysMatch(canonicalKeyForSyncEntry(entry), folderKey)) return true;
  for (const v of entry.versions ?? []) {
    const relativePath = folderRelativePathFromVersion(v);
    if (relativePath && syncKeysMatch(relativePath, folderKey)) return true;
  }
  const prefix = entry.prefix ?? cardPrefixFromRow(entry);
  const name = entry.name;
  if (prefix && name && syncKeysMatch(`${prefix}__${name}`, folderKey)) {
    return true;
  }
  return false;
}

/**
 * @param {Array<{ key?: string, versions?: Array<{ filename?: string }> }>} list
 * @param {string} folderKey
 */
export function findSyncEntryByFolderKey(list, folderKey) {
  return (list ?? []).find((entry) => entryMatchesFolderKey(entry, folderKey));
}

export function findSyncEntryForFolderGroup(list, folderKey, group) {
  const byKey = findSyncEntryByFolderKey(list, folderKey);
  if (byKey) return byKey;
  const folderBookmarkUrl = bookmarkUrlForFolderGroup(group);
  if (!folderBookmarkUrl) return undefined;
  return (list ?? []).find((entry) => bookmarkUrlForSyncEntry(entry) === folderBookmarkUrl);
}

/**
 * @param {Record<string, { parsed: unknown, versions: Array<{ version: number }> }>} grouped
 * @param {Array<{ key: string, versions?: Array<{ version: number }> }>} canvasCards
 * @param {Array<{ key: string, versions?: Array<{ version: number }> }>} stagedCards
 */
export function buildSyncChangesFromFolder(grouped, canvasCards, stagedCards) {
  const changes = [];
  const refreshPatches = [];
  const stagedRefreshPatches = [];

  Object.entries(grouped).forEach(([key, group]) => {
    const canvasCard = findSyncEntryForFolderGroup(canvasCards, key, group);
    const stagedCard = findSyncEntryForFolderGroup(stagedCards, key, group);
    const existing = canvasCard ?? stagedCard;

    if (!existing) {
      changes.push({ type: 'new', key, group });
      return;
    }

    const existingVersions = existing.versions ?? [];
    const diskVersions = group.versions ?? [];
    const newVersions = diskVersions.filter(
      (v) => !existingVersions.find((ev) => ev.version === v.version),
    );
    const needsPreviewRefresh = diskVersions.some((diskV) => {
      const ev = existingVersions.find((e) => e.version === diskV.version);
      if (!ev) return false;
      return shouldRefreshVersionFromDisk(ev, diskV);
    });

    if (newVersions.length > 0) {
      changes.push({ type: 'updated', key, group, existing, newVersions });
    } else if (needsPreviewRefresh) {
      const patchKey = existing?.key ?? key;
      if (canvasCard) {
        refreshPatches.push({ key: patchKey, group });
      } else {
        stagedRefreshPatches.push({ key: patchKey, group });
      }
    }
  });

  return { changes, refreshPatches, stagedRefreshPatches };
}

/**
 * @param {{ type: string, key: string, group: { parsed: { ext: string, prefix: string, name: string } } }} change
 */
export function isAgentChatSyncChange(change) {
  if (change?.type !== 'new') return false;
  const cardType = cardTypeFromSync({
    ext: change.group.parsed.ext,
    prefix: change.group.parsed.prefix,
    name: change.group.parsed.name,
  });
  return cardType === 'agent_chat';
}

/**
 * @param {ReturnType<typeof buildSyncChangesFromFolder>['changes']} changes
 */
export function partitionSyncChanges(changes) {
  const autoStageAgentChat = [];
  const confirmChanges = [];
  for (const change of changes ?? []) {
    if (isAgentChatSyncChange(change)) autoStageAgentChat.push(change);
    else confirmChanges.push(change);
  }
  return { autoStageAgentChat, confirmChanges };
}

/**
 * Agent-chat files already known (canvas, dock, or thread index) should not re-prompt.
 * @param {ReturnType<typeof buildSyncChangesFromFolder>['changes']} changes
 * @param {Array<{ key?: string, versions?: unknown[] }>} canvasCards
 * @param {Array<{ key?: string, versions?: unknown[] }>} [stagedCards]
 * @param {Set<string> | null} [knownAgentChatKeys]
 */
export function filterSyncChangesForConfirm(
  changes,
  canvasCards,
  stagedCards = [],
  knownAgentChatKeys = null,
) {
  return (changes ?? []).filter((change) => {
    if (change.type !== 'new') return true;
    if (findSyncEntryForFolderGroup(canvasCards, change.key, change.group)) return false;
    if (findSyncEntryForFolderGroup(stagedCards, change.key, change.group)) return false;
    const cardType = cardTypeFromSync({
      ext: change.group.parsed.ext,
      prefix: change.group.parsed.prefix,
      name: change.group.parsed.name,
    });
    if (cardType !== 'agent_chat') return true;
    const canonical = toCanonicalSyncKey(change.key);
    if (knownAgentChatKeys?.has(canonical)) return false;
    return true;
  });
}

/**
 * Build SYNC confirm dialog changes from folder scan vs current canvas + dock.
 * Re-run with live refs after async scan so dock→canvas moves are not shown as "new".
 *
 * @param {Record<string, object>} grouped
 * @param {object[]} canvasCards
 * @param {object[]} stagedCards
 * @param {{ suppressedKeys?: Set<string>, knownAgentChatKeys?: Set<string> | null }} [opts]
 */
export function buildConfirmChangesForDialog(
  grouped,
  canvasCards,
  stagedCards,
  { suppressedKeys = new Set(), knownAgentChatKeys = null } = {},
) {
  const { changes } = buildSyncChangesFromFolder(grouped, canvasCards, stagedCards);
  const filtered = (changes ?? []).filter(
    (c) =>
      !suppressedKeys.has(c.key)
      && !suppressedKeys.has(toCanonicalSyncKey(c.key)),
  );
  const { confirmChanges } = partitionSyncChanges(filtered);
  return filterSyncChangesForConfirm(
    confirmChanges,
    canvasCards,
    stagedCards,
    knownAgentChatKeys,
  );
}

/**
 * After linking a folder on this browser, the server may already list artefacts while
 * buildConfirmChangesForDialog returns nothing (metadata in sync, previews on disk).
 * Surface disk files in the import dialog so the user can confirm hydration.
 *
 * @param {Record<string, object>} grouped
 * @param {object[]} canvasCards
 * @param {object[]} stagedCards
 * @param {{ suppressedKeys?: Set<string>, knownAgentChatKeys?: Set<string> | null }} [opts]
 */
export function buildFolderConnectConfirmChanges(
  grouped,
  canvasCards,
  stagedCards,
  { suppressedKeys = new Set(), knownAgentChatKeys = null } = {},
) {
  const primary = buildConfirmChangesForDialog(grouped, canvasCards, stagedCards, {
    suppressedKeys,
    knownAgentChatKeys,
  });
  if (primary.length > 0) return primary;

  const keys = Object.keys(grouped ?? {});
  if (keys.length === 0) return [];

  const { refreshPatches, stagedRefreshPatches } = buildSyncChangesFromFolder(
    grouped,
    canvasCards,
    stagedCards,
  );
  const patchChanges = [...refreshPatches, ...stagedRefreshPatches]
    .filter(
      (p) =>
        !suppressedKeys.has(p.key)
        && !suppressedKeys.has(toCanonicalSyncKey(p.key)),
    )
    .map(({ key, group }) => {
      const existing =
        findSyncEntryForFolderGroup(canvasCards, key, group)
        ?? findSyncEntryForFolderGroup(stagedCards, key, group);
      const diskVersions = group.versions ?? [];
      const newVersions = existing
        ? diskVersions.filter(
          (v) => !(existing.versions ?? []).find((ev) => ev.version === v.version),
        )
        : diskVersions;
      return {
        type: existing ? 'updated' : 'new',
        key,
        group,
        existing,
        newVersions,
      };
    });

  if (patchChanges.length > 0) {
    return filterSyncChangesForConfirm(
      patchChanges,
      canvasCards,
      stagedCards,
      knownAgentChatKeys,
    );
  }

  const diskLinked = keys
    .filter(
      (key) =>
        !suppressedKeys.has(key)
        && !suppressedKeys.has(toCanonicalSyncKey(key)),
    )
    .map((key) => {
      const group = grouped[key];
      const existing =
        findSyncEntryForFolderGroup(canvasCards, key, group)
        ?? findSyncEntryForFolderGroup(stagedCards, key, group);
      if (!existing) {
        return { type: 'new', key, group };
      }
      const diskVersions = group.versions ?? [];
      const newVersions = diskVersions.filter(
        (v) => !(existing.versions ?? []).find((ev) => ev.version === v.version),
      );
      return {
        type: 'updated',
        key,
        group,
        existing,
        newVersions,
      };
    });

  return filterSyncChangesForConfirm(
    diskLinked,
    canvasCards,
    stagedCards,
    knownAgentChatKeys,
  );
}

/**
 * @param {Array<{ version: number }>} existingVersions
 * @param {Array<{ version: number }>} newVersions
 * @param {Array<{ version: number }>} diskGroupVersions
 */
export function mergeVersionsForSyncUpdate(
  existingVersions,
  newVersions,
  diskGroupVersions,
) {
  let merged = [...newVersions, ...existingVersions].sort(
    (a, b) => b.version - a.version,
  );
  return mergeDiskPreviewIntoCardVersions(merged, diskGroupVersions);
}

export function stagedSyncCardToCanvasCard(staged, worldX, worldY) {
  const { w, h } = getCardPixelSize({ type: staged.type });
  return {
    id: crypto.randomUUID(),
    key: staged.key,
    ...(staged.relativePath ? { relativePath: staged.relativePath, folderPath: staged.relativePath } : {}),
    prefix: staged.prefix,
    name: staged.name,
    type: staged.type,
    versions: staged.versions,
    pinnedVersion: staged.pinnedVersion,
    x: worldX - w / 2,
    y: worldY - h / 2,
    ...(staged.audioSkinColor ? { audioSkinColor: staged.audioSkinColor } : {}),
  };
}

/**
 * @param {Array<{ key: string, x: number, y: number }>} cards
 * @param {ReturnType<typeof buildStagedSyncCardFromChange>} staged
 * @param {number} worldX
 * @param {number} worldY
 */
export function placeStagedCardOnCanvas(cards, staged, worldX, worldY) {
  const card = stagedSyncCardToCanvasCard(staged, worldX, worldY);
  const idx = cards.findIndex((c) => syncKeysMatch(c.key, card.key));
  if (idx >= 0) {
    const next = [...cards];
    next[idx] = { ...next[idx], x: card.x, y: card.y };
    return { cards: next, placed: true, movedExisting: true };
  }
  return { cards: [...cards, card], placed: true, movedExisting: false };
}

/**
 * @param {{ id: string, key?: string, prefix?: string, name?: string, type: string, versions?: unknown[], pinnedVersion?: number, audioSkinColor?: string }} card
 */
export function canvasCardToStaged(card) {
  const relativePath = card.relativePath ?? card.versions?.[0]?.relativePath ?? null;
  return {
    stagingId: crypto.randomUUID(),
    key: card.key ?? card.id,
    ...(relativePath ? { relativePath, folderPath: relativePath } : {}),
    prefix: card.prefix ?? '',
    name: card.name ?? card.key ?? card.id,
    type: card.type,
    versions: card.versions ?? [],
    pinnedVersion: card.pinnedVersion ?? card.versions?.[0]?.version ?? 1,
    ...(card.audioSkinColor ? { audioSkinColor: card.audioSkinColor } : {}),
  };
}

/**
 * @param {Array<{ key: string, stagingId: string }>} stagedCards
 * @param {ReturnType<typeof canvasCardToStaged>} staged
 */
export function upsertStagedFromCanvas(stagedCards, staged) {
  const idx = stagedCards.findIndex((s) => syncKeysMatch(s.key, staged.key));
  if (idx >= 0) {
    const next = [...stagedCards];
    next[idx] = staged;
    return next;
  }
  return [...stagedCards, staged];
}

/**
 * @param {Array<{ id: string }>} cards
 * @param {Array<{ key: string }>} stagedCards
 * @param {string} cardId
 */
export function dockCardFromCanvas(cards, stagedCards, cardId) {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return { docked: false };

  const staged = canvasCardToStaged(card);
  return {
    docked: true,
    cards: cards.filter((c) => c.id !== cardId),
    stagedCards: upsertStagedFromCanvas(stagedCards, staged),
    staged,
  };
}

/** Stable display order for sync holding tray type groups. */
export const STAGED_TYPE_GROUP_ORDER = [
  'markdown',
  'html',
  'image',
  'pdf',
  'video',
  'audio',
  'spreadsheet',
  'bookmark',
  'user_note',
  'agent_chat',
  'file',
];

/**
 * @param {Array<{ type?: string }>} stagedCards
 * @returns {Array<{ type: string, cards: typeof stagedCards }>}
 */
export function groupStagedCardsByType(stagedCards) {
  const byType = new Map();
  for (const card of stagedCards) {
    const type = normalizeCardType(card.type);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(card);
  }

  const groups = [];
  const seen = new Set();
  for (const type of STAGED_TYPE_GROUP_ORDER) {
    const cards = byType.get(type);
    if (cards?.length) {
      groups.push({ type, cards });
      seen.add(type);
    }
  }
  for (const [type, cards] of byType) {
    if (!seen.has(type)) groups.push({ type, cards });
  }
  return groups;
}
