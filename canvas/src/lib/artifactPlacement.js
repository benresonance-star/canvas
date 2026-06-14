import {
  cardKeyFromFilename,
  folderRelativePathFromVersion,
  syncKeysMatch,
  toCanonicalSyncKey,
} from './filename.js';
import { getCardPixelSize } from './cards.js';
import {
  dockCardFromCanvas,
  findSyncEntryByFolderKey,
  placeStagedCardOnCanvas,
  upsertStagedFromCanvas,
} from './syncStaging.js';

/** Default spawn for thread-owned cards (outside auto-spawn dock-preference zone). */
export const AGENT_CHAT_SPAWN_BASE_X = 400;
export const AGENT_CHAT_SPAWN_BASE_Y = 80;

/**
 * @param {{ key?: string, versions?: Array<{ filename?: string }> }} entry
 */
export function canonicalKeyForEntry(entry) {
  if (!entry) return '';
  const fromFile = folderRelativePathFromVersion(entry.versions?.[0]);
  if (fromFile) return cardKeyFromFilename(fromFile);
  return toCanonicalSyncKey(entry.key);
}

/**
 * @param {object[]} cards
 * @param {object[]} staged
 * @param {string} keyOrCanonical
 * @returns {'canvas' | 'dock' | null}
 */
export function resolvePlacement(cards, staged, keyOrCanonical) {
  const canonical = toCanonicalSyncKey(keyOrCanonical);
  if (!canonical) return null;
  const onCanvas = findSyncEntryByFolderKey(cards ?? [], canonical);
  const onDock = findSyncEntryByFolderKey(staged ?? [], canonical);
  if (onCanvas) return 'canvas';
  if (onDock) return 'dock';
  return null;
}

/**
 * @param {object} card
 * @param {string | null | undefined} threadCardId
 */
export function isAgentChatAutoSpawnCanvasCard(card, threadCardId) {
  if (!card || card.type !== 'agent_chat') return false;
  if (threadCardId && card.id === threadCardId) return false;
  const x = card.x ?? 0;
  const y = card.y ?? 0;
  return (
    x >= AGENT_CHAT_SPAWN_BASE_X
    && x <= AGENT_CHAT_SPAWN_BASE_X + 240
    && y >= AGENT_CHAT_SPAWN_BASE_Y
    && y <= AGENT_CHAT_SPAWN_BASE_Y + 240
  );
}

/**
 * @param {object[]} cards
 * @param {object[]} staged
 * @param {object} canvasEntry
 * @param {object} stagedEntry
 * @param {{ preferredCardId?: string | null, threads?: Array<{ cardId?: string | null, filename?: string }> }} opts
 */
function resolveDuplicateWinner(canvasEntry, stagedEntry, opts = {}) {
  const { preferredCardId, threads = [] } = opts;
  if (
    preferredCardId
    && canvasEntry?.id === preferredCardId
  ) {
    return 'canvas';
  }
  const threadForCanvas = threads.find((t) => t.cardId === canvasEntry?.id);
  if (threadForCanvas) return 'canvas';

  const filename =
    folderRelativePathFromVersion(canvasEntry?.versions?.[0])
    || folderRelativePathFromVersion(stagedEntry?.versions?.[0]);
  const threadByFile = filename
    ? threads.find((t) => t.filename && syncKeysMatch(t.filename, filename))
    : null;
  if (threadByFile?.cardId === canvasEntry?.id) return 'canvas';
  if (threadByFile) {
    const canvasMatchesThread =
      !threadByFile.cardId
      || threadByFile.cardId === canvasEntry?.id
      || (threadByFile.threadId && canvasEntry?.agentThreadId === threadByFile.threadId);
    if (canvasMatchesThread) return 'canvas';
  }

  if (
    isAgentChatAutoSpawnCanvasCard(
      canvasEntry,
      threadByFile?.cardId ?? threadForCanvas?.cardId,
    )
  ) {
    return 'dock';
  }

  return 'canvas';
}

/**
 * Remove duplicate canonical keys within one surface (keeps first occurrence).
 * @param {object[]} entries
 */
export function dedupeSurfaceByCanonicalKey(entries) {
  const seen = new Set();
  let changed = false;
  const next = [];
  for (const entry of entries ?? []) {
    const k = canonicalKeyForEntry(entry);
    if (k && seen.has(k)) {
      changed = true;
      continue;
    }
    if (k) seen.add(k);
    next.push(entry);
  }
  return { entries: next, changed };
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {{ preferredCardId?: string | null, threads?: object[] }} [opts]
 */
export function enforceExclusivePlacement(cards, stagedSyncCards, opts = {}) {
  const dedupedCards = dedupeSurfaceByCanonicalKey(cards ?? []);
  const dedupedStaged = dedupeSurfaceByCanonicalKey(stagedSyncCards ?? []);
  let nextCards = dedupedCards.entries;
  let nextStaged = dedupedStaged.entries;
  let changed = dedupedCards.changed || dedupedStaged.changed;

  const canvasByKey = new Map();
  for (const c of nextCards) {
    const k = canonicalKeyForEntry(c);
    if (!k) continue;
    if (!canvasByKey.has(k)) canvasByKey.set(k, c);
  }

  const stagedByKey = new Map();
  for (const s of nextStaged) {
    const k = canonicalKeyForEntry(s);
    if (!k) continue;
    if (!stagedByKey.has(k)) stagedByKey.set(k, s);
  }

  const duplicateKeys = [...canvasByKey.keys()].filter((k) => stagedByKey.has(k));

  for (const key of duplicateKeys) {
    const canvasEntry = canvasByKey.get(key);
    const stagedEntry = stagedByKey.get(key);
    const winner = resolveDuplicateWinner(canvasEntry, stagedEntry, opts);
    if (winner === 'canvas') {
      nextStaged = nextStaged.filter(
        (s) => !syncKeysMatch(canonicalKeyForEntry(s), key),
      );
    } else {
      nextCards = nextCards.filter(
        (c) => !syncKeysMatch(canonicalKeyForEntry(c), key),
      );
    }
    changed = true;
  }

  return { cards: nextCards, stagedSyncCards: nextStaged, changed };
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {string} cardId
 */
export function moveToDock(cards, stagedSyncCards, cardId) {
  const result = dockCardFromCanvas(cards, stagedSyncCards, cardId);
  if (!result.docked) return { ...result, cards, stagedSyncCards };
  const enforced = enforceExclusivePlacement(result.cards, result.stagedCards);
  return {
    docked: true,
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    staged: result.staged,
  };
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {string} stagingId
 * @param {number} worldX
 * @param {number} worldY
 */
export function moveToCanvas(cards, stagedSyncCards, stagingId, worldX, worldY) {
  const staged = (stagedSyncCards ?? []).find((s) => s.stagingId === stagingId);
  if (!staged) {
    return { cards, stagedSyncCards, placed: false };
  }

  const placed = placeStagedCardOnCanvas(cards, staged, worldX, worldY);
  let nextStaged = stagedSyncCards.filter((s) => s.stagingId !== stagingId);
  const enforced = enforceExclusivePlacement(placed.cards, nextStaged);
  return {
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    placed: placed.placed,
    movedExisting: placed.movedExisting,
  };
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {{ key: string, surface: 'canvas' | 'dock', payload: object, opts?: object }} params
 */
export function upsertOnSurface(cards, stagedSyncCards, { key, surface, payload, opts }) {
  const canonical = toCanonicalSyncKey(key);
  let nextCards = [...(cards ?? [])];
  let nextStaged = [...(stagedSyncCards ?? [])];

  if (surface === 'canvas') {
    nextStaged = nextStaged.filter(
      (s) => !syncKeysMatch(canonicalKeyForEntry(s), canonical),
    );
    const idx = nextCards.findIndex(
      (c) => syncKeysMatch(canonicalKeyForEntry(c), canonical),
    );
    if (idx >= 0) {
      nextCards = [...nextCards];
      nextCards[idx] = { ...nextCards[idx], ...payload };
    } else {
      nextCards = [...nextCards, payload];
    }
  } else {
    nextCards = nextCards.filter(
      (c) => !syncKeysMatch(canonicalKeyForEntry(c), canonical),
    );
    const existing = findSyncEntryByFolderKey(nextStaged, canonical);
    if (existing) {
      nextStaged = nextStaged.map((s) =>
        syncKeysMatch(canonicalKeyForEntry(s), canonical)
          ? { ...s, ...payload }
          : s,
      );
    } else {
      nextStaged = upsertStagedFromCanvas(nextStaged, payload);
    }
  }

  const enforced = enforceExclusivePlacement(nextCards, nextStaged, opts);
  return enforced;
}

/**
 * Build a canvas agent_chat card payload for upsertOnSurface.
 * @param {object} thread
 * @param {number} threadIndex
 */
export function buildAgentChatCanvasPayload(thread, threadIndex = 0) {
  const { filename, title, syncResult, threadId } = thread;
  const cardKey = cardKeyFromFilename(filename);
  const { w, h } = getCardPixelSize({ type: 'agent_chat' });
  const offset = threadIndex * 40;
  return {
    id: crypto.randomUUID(),
    key: cardKey,
    prefix: 'notes',
    name: title || 'Agent chat',
    type: 'agent_chat',
    ...(threadId ? { agentThreadId: threadId } : {}),
    versions: [
      {
        version: 1,
        filename,
        content_hash: syncResult?.content_hash ?? '',
        artifactRef: syncResult?.artifactRef ?? null,
      },
    ],
    pinnedVersion: 1,
    x: AGENT_CHAT_SPAWN_BASE_X + offset,
    y: AGENT_CHAT_SPAWN_BASE_Y + offset,
    width: w,
    height: h,
  };
}
