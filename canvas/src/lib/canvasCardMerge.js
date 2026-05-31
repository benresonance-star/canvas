import {
  cardKeyFromFilename,
  isFolderBackedCanvasCard,
  toCanonicalSyncKey,
} from './filename.js';
import { enforceExclusivePlacement } from './artifactPlacement.js';

/**
 * Merge persisted project cards into live React canvas state without dropping
 * in-memory-only cards (e.g. agent transcript card created before autosave runs).
 *
 * @param {object[] | undefined} liveCards
 * @param {object[] | undefined} persistedCards
 * @param {{ preferLiveMembership?: boolean, authoritativePersisted?: boolean }} [options]
 * @returns {object[]}
 */
export function mergePersistedCardsIntoCanvas(
  liveCards,
  persistedCards,
  { preferLiveMembership = false, authoritativePersisted = false } = {},
) {
  const live = liveCards ?? [];
  const persisted = persistedCards ?? [];

  if (authoritativePersisted) {
    return persisted.length > 0 ? [...persisted] : live;
  }

  if (persisted.length === 0) return live;

  if (live.length === 0) {
    return preferLiveMembership ? [] : persisted;
  }

  const persistedById = new Map(persisted.map((c) => [c.id, c]));
  const persistedByKey = new Map(persisted.map((c) => [c.key, c]));

  const liveIsDeletionSubset =
    live.length < persisted.length
    && live.every((c) => persistedById.has(c.id));

  if (liveIsDeletionSubset) {
    return live.map((c) => persistedById.get(c.id) ?? c);
  }

  const merged = [];
  const usedPersistedIds = new Set();

  for (const liveCard of live) {
    const saved =
      persistedById.get(liveCard.id)
      ?? (liveCard.key ? persistedByKey.get(liveCard.key) : null);
    if (saved) {
      merged.push(saved);
      usedPersistedIds.add(saved.id);
    } else {
      merged.push(liveCard);
    }
  }

  const liveHasUnsavedCards =
    live.some((c) => !persistedById.has(c.id))
    || live.length > persisted.length;

  if (!liveHasUnsavedCards) {
    for (const saved of persisted) {
      if (!usedPersistedIds.has(saved.id)) merged.push(saved);
    }
  }

  return merged;
}

/**
 * @param {string | null | undefined} preferredCardId
 * @param {Set<string>} preferredIds
 * @param {object[]} group
 */
function pickAgentChatKeeper(preferredCardId, preferredIds, group) {
  return (
    (preferredCardId && group.find((c) => c.id === preferredCardId))
    ?? [...group].find((c) => preferredIds.has(c.id))
    ?? group.find((c) => c.name && !/^agent-chat/i.test(c.name))
    ?? group[group.length - 1]
  );
}

/**
 * Collapse true duplicates (same thread or same canonical key), not all chats per connector.
 * @param {object[]} cards
 * @param {string | null | undefined} connectorId
 * @param {string | null | undefined} [preferredCardId]
 * @param {{ threads?: Array<{ threadId?: string, cardId?: string | null }> }} [options]
 */
export function dedupeAgentChatCardsForConnector(
  cards,
  connectorId,
  preferredCardId,
  { threads = [] } = {},
) {
  if (!connectorId) return cards ?? [];
  const safe = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  const prefix = `notes__agent-chat-${safe}`;
  const agentCards = (cards ?? []).filter(
    (c) => c.type === 'agent_chat' && c.key?.startsWith(prefix),
  );
  if (agentCards.length <= 1) return cards ?? [];

  const preferredIds = new Set();
  if (preferredCardId) preferredIds.add(preferredCardId);
  for (const t of threads) {
    if (t?.cardId) preferredIds.add(t.cardId);
  }

  const buckets = new Map();
  for (const card of agentCards) {
    const bucketKey = card.agentThreadId
      ? `thread:${card.agentThreadId}`
      : `key:${canonicalKeyFromVersions(card) || card.id}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(card);
  }

  const dropIds = new Set();
  for (const group of buckets.values()) {
    if (group.length <= 1) continue;
    const keeper = pickAgentChatKeeper(preferredCardId, preferredIds, group);
    for (const c of group) {
      if (c.id !== keeper.id) dropIds.add(c.id);
    }
  }

  if (!dropIds.size) return cards ?? [];
  return (cards ?? []).filter((c) => !dropIds.has(c.id));
}

/**
 * @param {object[]} stagedCards
 * @param {string} cardKey
 */
export function removeStagedCardsByKey(stagedCards, cardKey) {
  if (!cardKey) return stagedCards ?? [];
  return (stagedCards ?? []).filter((s) => s.key !== cardKey);
}

/**
 * @param {object[]} stagedCards
 * @param {Set<string>} suppressedKeys
 */
export function filterSuppressedStagedCards(stagedCards, suppressedKeys) {
  if (!suppressedKeys?.size) return stagedCards ?? [];
  return (stagedCards ?? []).filter((s) => !suppressedKeys.has(s.key));
}

/**
 * @param {object[]} stagedCards
 * @param {string | null | undefined} connectorId
 */
export function dedupeAgentChatStagedForConnector(stagedCards, connectorId) {
  if (!connectorId) return stagedCards ?? [];
  const safe = String(connectorId).replace(/[^a-zA-Z0-9_-]/g, '-');
  const prefix = `notes__agent-chat-${safe}`;
  const matches = (stagedCards ?? []).filter(
    (s) => s.type === 'agent_chat' && s.key?.startsWith(prefix),
  );
  if (matches.length <= 1) return stagedCards ?? [];

  const buckets = new Map();
  for (const staged of matches) {
    const bucketKey = `key:${canonicalKeyFromVersions(staged) || staged.stagingId}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(staged);
  }

  const dropIds = new Set();
  for (const group of buckets.values()) {
    if (group.length <= 1) continue;
    const keeper =
      group.find((s) => s.name && !/^agent-chat/i.test(s.name))
      ?? group[group.length - 1];
    for (const s of group) {
      if (s.stagingId !== keeper.stagingId) dropIds.add(s.stagingId);
    }
  }

  if (!dropIds.size) return stagedCards ?? [];
  return (stagedCards ?? []).filter((s) => !dropIds.has(s.stagingId));
}

function canonicalKeyFromVersions(entry) {
  for (const v of entry?.versions ?? []) {
    if (v?.filename) return cardKeyFromFilename(v.filename);
  }
  return toCanonicalSyncKey(entry?.key);
}

/**
 * Rewrite folder-backed card keys to canonical fullBase from any version filename.
 * @param {object[]} cards
 */
export function migrateFolderBackedCardKeys(cards) {
  let changed = false;
  const next = (cards ?? []).map((card) => {
    if (!isFolderBackedCanvasCard(card)) return card;
    const canonical = canonicalKeyFromVersions(card);
    if (canonical && card.key !== canonical) {
      changed = true;
      return { ...card, key: canonical };
    }
    return card;
  });
  return { cards: next, changed };
}

/**
 * @param {object[]} stagedCards
 */
export function migrateFolderBackedStagedKeys(stagedCards) {
  let changed = false;
  const next = (stagedCards ?? []).map((staged) => {
    if (!isFolderBackedCanvasCard(staged)) return staged;
    const canonical = canonicalKeyFromVersions(staged);
    if (canonical && staged.key !== canonical) {
      changed = true;
      return { ...staged, key: canonical };
    }
    return staged;
  });
  return { stagedSyncCards: next, changed };
}

/**
 * Rewrite legacy agent_chat keys (filename minus ext, includes -vN) to fullBase.
 * @param {object[]} cards
 */
export function migrateAgentChatCardKeys(cards) {
  let changed = false;
  const next = (cards ?? []).map((card) => {
    if (card.type !== 'agent_chat') return card;
    const filename = card.versions?.[0]?.filename;
    const canonical = filename
      ? cardKeyFromFilename(filename)
      : toCanonicalSyncKey(card.key);
    if (canonical && card.key !== canonical) {
      changed = true;
      return { ...card, key: canonical };
    }
    return card;
  });
  return { cards: next, changed };
}

/**
 * @param {object[]} stagedCards
 */
export function migrateAgentChatStagedKeys(stagedCards) {
  let changed = false;
  const next = (stagedCards ?? []).map((staged) => {
    if (staged.type !== 'agent_chat') return staged;
    const filename = staged.versions?.[0]?.filename;
    const canonical = filename
      ? cardKeyFromFilename(filename)
      : toCanonicalSyncKey(staged.key);
    if (canonical && staged.key !== canonical) {
      changed = true;
      return { ...staged, key: canonical };
    }
    return staged;
  });
  return { stagedSyncCards: next, changed };
}

/**
 * Normalize canvas + dock staging for agent chats (suppressed keys, dedupe).
 */
export function sanitizeAgentChatProjectState(
  cards,
  stagedCards,
  { connectorId, preferredCardId, suppressedKeys, threads },
) {
  const folderBackedCards = migrateFolderBackedCardKeys(cards ?? []);
  const folderBackedStaged = migrateFolderBackedStagedKeys(stagedCards ?? []);
  const migratedCards = migrateAgentChatCardKeys(folderBackedCards.cards);
  const migratedStaged = migrateAgentChatStagedKeys(folderBackedStaged.stagedSyncCards);
  let nextCards = dedupeAgentChatCardsForConnector(
    migratedCards.cards,
    connectorId,
    preferredCardId,
    { threads: threads ?? [] },
  );
  if (suppressedKeys?.size) {
    nextCards = nextCards.filter((c) => !c.key || !suppressedKeys.has(c.key));
  }
  let nextStaged = filterSuppressedStagedCards(
    migratedStaged.stagedSyncCards,
    suppressedKeys,
  );
  nextStaged = dedupeAgentChatStagedForConnector(nextStaged, connectorId);

  const exclusive = enforceExclusivePlacement(nextCards, nextStaged, {
    preferredCardId,
    threads: threads ?? [],
  });

  return {
    cards: exclusive.cards,
    stagedSyncCards: exclusive.stagedSyncCards,
    keysMigrated:
      folderBackedCards.changed
      || folderBackedStaged.changed
      || migratedCards.changed
      || migratedStaged.changed
      || exclusive.changed,
  };
}
