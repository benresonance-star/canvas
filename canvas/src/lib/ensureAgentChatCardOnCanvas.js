import { cardKeyFromFilename, syncKeysMatch } from './filename.js';
import { findSyncEntryByFolderKey } from './syncStaging.js';
import { buildAgentChatStagedRow } from './stageAgentChatCard.js';
import { upsertOnSurface } from './artifactPlacement.js';

function buildVersionRow(thread, existingVersion = {}) {
  const { filename, syncResult } = thread;
  return {
    ...existingVersion,
    filename,
    content_hash: syncResult?.content_hash ?? existingVersion.content_hash ?? '',
    artifactRef: syncResult?.artifactRef ?? existingVersion.artifactRef ?? null,
  };
}

/**
 * Ensure an agent_chat artifact exists for a thread (dock by default; canvas when already placed).
 * @param {object[]} cards
 * @param {{ filename: string, cardId?: string | null, title?: string, threadId?: string, threadIndex?: number, syncResult?: { content_hash?: string, artifactRef?: object } }} thread
 * @param {{ suppressedKeys?: Set<string>, stagedSyncCards?: object[], threads?: object[] }} options
 */
export function ensureAgentChatCardOnCanvas(cards, thread, options = {}) {
  const { filename, title, threadId } = thread;
  const { suppressedKeys, stagedSyncCards = [], threads = [] } = options;
  const cardKey = cardKeyFromFilename(filename);
  const upsertOpts = { threads };

  if (suppressedKeys?.has(cardKey)) {
    return {
      cards,
      stagedSyncCards,
      cardId: null,
      created: false,
      suppressed: true,
    };
  }

  if (thread.cardId) {
    const existing = cards.find((c) => c.id === thread.cardId);
    if (existing) {
      const updated = {
        ...existing,
        ...(threadId ? { agentThreadId: threadId } : {}),
        ...(title ? { name: title } : {}),
        versions: [buildVersionRow(thread, existing.versions?.[0])],
      };
      const result = upsertOnSurface(cards, stagedSyncCards, {
        key: cardKey,
        surface: 'canvas',
        payload: updated,
        opts: { ...upsertOpts, preferredCardId: thread.cardId },
      });
      return {
        cards: result.cards,
        stagedSyncCards: result.stagedSyncCards,
        cardId: existing.id,
        created: false,
        onDock: false,
      };
    }
  }

  const byKey = cards.find(
    (c) => syncKeysMatch(c.key, cardKey) || syncKeysMatch(c.versions?.[0]?.filename, cardKey),
  );
  if (byKey) {
    const updated = {
      ...byKey,
      ...(threadId ? { agentThreadId: threadId } : {}),
      ...(title ? { name: title } : {}),
      versions: [buildVersionRow(thread, byKey.versions?.[0])],
    };
    const result = upsertOnSurface(cards, stagedSyncCards, {
      key: cardKey,
      surface: 'canvas',
      payload: updated,
      opts: { ...upsertOpts, preferredCardId: byKey.id },
    });
    return {
      cards: result.cards,
      stagedSyncCards: result.stagedSyncCards,
      cardId: byKey.id,
      created: false,
      onDock: false,
    };
  }

  const dockEntry = findSyncEntryByFolderKey(stagedSyncCards, cardKey);
  if (dockEntry) {
    const updated = {
      ...dockEntry,
      ...(threadId ? { agentThreadId: threadId } : {}),
      ...(title ? { name: title } : {}),
      versions: [buildVersionRow(thread, dockEntry.versions?.[0])],
    };
    const result = upsertOnSurface(cards, stagedSyncCards, {
      key: cardKey,
      surface: 'dock',
      payload: updated,
      opts: upsertOpts,
    });
    return {
      cards: result.cards,
      stagedSyncCards: result.stagedSyncCards,
      cardId: null,
      created: false,
      onDock: true,
    };
  }

  const row = buildAgentChatStagedRow({
    filename,
    title,
    threadId,
    syncResult: thread.syncResult,
  });
  const result = upsertOnSurface(cards, stagedSyncCards, {
    key: cardKey,
    surface: 'dock',
    payload: row,
    opts: upsertOpts,
  });

  return {
    cards: result.cards,
    stagedSyncCards: result.stagedSyncCards,
    cardId: null,
    created: true,
    onDock: true,
  };
}
