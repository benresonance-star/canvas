import { cardKeyFromFilename, syncKeysMatch } from './filename.js';
import {
  buildAgentChatCanvasPayload,
  enforceExclusivePlacement,
  upsertOnSurface,
} from './artifactPlacement.js';

/**
 * Ensure an agent_chat card exists on the canvas for a thread (when user has placed it).
 * @param {object[]} cards
 * @param {{ filename: string, cardId?: string | null, title?: string, threadId?: string, threadIndex?: number, syncResult?: { content_hash?: string, artifactRef?: object } }} thread
 * @param {{ suppressedKeys?: Set<string>, stagedSyncCards?: object[], threads?: object[] }} options
 */
export function ensureAgentChatCardOnCanvas(cards, thread, options = {}) {
  const { filename, title, threadId, threadIndex = 0 } = thread;
  const { suppressedKeys, stagedSyncCards = [], threads = [] } = options;
  const cardKey = cardKeyFromFilename(filename);

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
        versions: [
          {
            ...existing.versions?.[0],
            filename,
            content_hash: thread.syncResult?.content_hash ?? existing.versions?.[0]?.content_hash ?? '',
            artifactRef: thread.syncResult?.artifactRef ?? existing.versions?.[0]?.artifactRef ?? null,
          },
        ],
      };
      const result = upsertOnSurface(cards, stagedSyncCards, {
        key: cardKey,
        surface: 'canvas',
        payload: updated,
        opts: { preferredCardId: thread.cardId, threads },
      });
      return {
        cards: result.cards,
        stagedSyncCards: result.stagedSyncCards,
        cardId: existing.id,
        created: false,
      };
    }
    return {
      cards,
      stagedSyncCards,
      cardId: null,
      created: false,
      removedFromCanvas: true,
    };
  }

  const byKey = cards.find(
    (c) => syncKeysMatch(c.key, cardKey) || syncKeysMatch(c.versions?.[0]?.filename, cardKey),
  );
  if (byKey) {
    const updated = {
      ...byKey,
      ...(threadId ? { agentThreadId: threadId } : {}),
      ...(title ? { name: title } : {}),
      versions: [
        {
          ...byKey.versions?.[0],
          filename,
          content_hash:
            thread.syncResult?.content_hash
            ?? byKey.versions?.[0]?.content_hash
            ?? '',
          artifactRef:
            thread.syncResult?.artifactRef
            ?? byKey.versions?.[0]?.artifactRef
            ?? null,
        },
      ],
    };
    const result = upsertOnSurface(cards, stagedSyncCards, {
      key: cardKey,
      surface: 'canvas',
      payload: updated,
      opts: { preferredCardId: byKey.id, threads },
    });
    return {
      cards: result.cards,
      stagedSyncCards: result.stagedSyncCards,
      cardId: byKey.id,
      created: false,
    };
  }

  const payload = buildAgentChatCanvasPayload(thread, threadIndex);
  const result = upsertOnSurface(cards, stagedSyncCards, {
    key: cardKey,
    surface: 'canvas',
    payload,
    opts: { threads },
  });
  const placed = result.cards.find((c) => c.id === payload.id) ?? payload;

  return {
    cards: result.cards,
    stagedSyncCards: result.stagedSyncCards,
    cardId: placed.id,
    created: true,
  };
}
