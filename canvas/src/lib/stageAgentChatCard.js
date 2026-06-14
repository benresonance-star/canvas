import { cardKeyFromFilename, syncKeysMatch } from './filename.js';
import { mergeNewlyStaged } from './syncStaging.js';
import { resolvePlacement } from './artifactPlacement.js';

/**
 * @param {object[]} stagedCards
 * @param {{ filename: string, title?: string, threadId?: string, syncResult?: { content_hash?: string, artifactRef?: object } }} params
 * @param {object[]} [canvasCards]
 */
export function buildAgentChatStagedRow({ filename, title, threadId, syncResult }) {
  const cardKey = cardKeyFromFilename(filename);
  return {
    stagingId: crypto.randomUUID(),
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
        artifactSyncState: syncResult?.artifactRef ? 'synced' : syncResult?.artifactSyncState,
      },
    ],
    pinnedVersion: 1,
  };
}

/**
 * Stage agent chat to dock when not already on canvas.
 * @param {object[]} stagedCards
 * @param {object[]} canvasCards
 * @param {{ filename: string, title?: string, syncResult?: object }} params
 */
export function stageAgentChatCard(stagedCards, canvasCards, params) {
  const cardKey = cardKeyFromFilename(params.filename);
  if (resolvePlacement(canvasCards, stagedCards, cardKey) === 'canvas') {
    return { stagedCards, created: false, onCanvas: true };
  }

  const existing = (stagedCards ?? []).find(
    (s) =>
      syncKeysMatch(s.key, cardKey)
      || syncKeysMatch(s.versions?.[0]?.filename, cardKey),
  );
  if (existing) {
    const updated = {
      ...existing,
      name: params.title || existing.name,
      versions: [
        {
          ...existing.versions?.[0],
          filename: params.filename,
          content_hash: params.syncResult?.content_hash ?? existing.versions?.[0]?.content_hash ?? '',
          artifactRef: params.syncResult?.artifactRef ?? existing.versions?.[0]?.artifactRef ?? null,
          artifactSyncState:
            params.syncResult?.artifactRef
              ? 'synced'
              : params.syncResult?.artifactSyncState ?? existing.versions?.[0]?.artifactSyncState,
        },
      ],
    };
    const next = stagedCards.map((s) =>
      s.stagingId === existing.stagingId ? updated : s,
    );
    return { stagedCards: next, created: false, onCanvas: false };
  }

  const row = buildAgentChatStagedRow(params);
  return {
    stagedCards: mergeNewlyStaged(stagedCards ?? [], [row]),
    created: true,
    onCanvas: false,
  };
}
