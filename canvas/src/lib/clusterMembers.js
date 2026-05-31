import { resolveThreadForCard } from './agentChatThreads.js';

/**
 * @param {object} card
 * @param {{ threads?: object[], connectorId?: string }} [options]
 * @returns {string | null}
 */
export function artifactRefIdForClusterCard(card, options = {}) {
  const pinned =
    card.versions?.find((v) => v.version === card.pinnedVersion) || card.versions?.[0];
  if (pinned?.artifactRef?.id) return pinned.artifactRef.id;
  if (card.type === 'agent_chat' && options.threads?.length) {
    const thread = resolveThreadForCard(
      { threads: options.threads },
      card,
      options.connectorId ?? '',
    );
    return thread?.artifactRef?.id ?? null;
  }
  return null;
}

/**
 * Build artifact primitive refs from canvas cards (pinned version).
 * @param {object[]} cards
 * @param {{ threads?: object[], connectorId?: string }} [options]
 * @returns {{ id: string, type: 'artifact' }[]}
 */
export function artifactMembersFromCards(cards, options = {}) {
  const members = [];
  for (const card of cards) {
    const id = artifactRefIdForClusterCard(card, options);
    if (id) members.push({ id, type: 'artifact' });
  }
  return members;
}

/**
 * @param {object[]} cards
 * @param {{ threads?: object[], connectorId?: string }} [options]
 * @returns {{ selected: number, syncable: number }}
 */
export function clusterSelectionStatsFromCards(cards, options = {}) {
  let syncable = 0;
  for (const c of cards) {
    if (artifactRefIdForClusterCard(c, options)) syncable += 1;
  }
  return { selected: cards.length, syncable };
}

/**
 * @param {string | null | undefined} activeCardId
 * @param {Set<string> | undefined} selectedCardIds
 * @returns {Set<string>}
 */
export function buildHighlightedCardIds(activeCardId, selectedCardIds) {
  const ids = new Set(selectedCardIds ?? []);
  if (activeCardId) ids.add(activeCardId);
  return ids;
}

/**
 * @param {{ id: string, cardKey?: string | null }} member
 * @param {Map<string, { cardId: string, cardKey?: string }>} artifactMap
 * @param {object[]} cards
 * @returns {string | null}
 */
export function cardIdForClusterMember(member, artifactMap, cards) {
  const hit = artifactMap.get(member.id);
  if (hit?.cardId) return hit.cardId;
  if (member.cardKey) {
    const card = cards.find((c) => c.key === member.cardKey);
    return card?.id ?? null;
  }
  return null;
}

/**
 * @param {{ id: string, cardKey?: string | null }} member
 * @param {Map<string, { cardId: string, cardKey?: string }>} artifactMap
 * @param {object[]} cards
 * @param {string | null | undefined} activeCardId
 * @param {Set<string> | undefined} selectedCardIds
 */
export function isClusterMemberHighlighted(
  member,
  artifactMap,
  cards,
  activeCardId,
  selectedCardIds,
) {
  const cardId = cardIdForClusterMember(member, artifactMap, cards);
  if (!cardId) return false;
  return buildHighlightedCardIds(activeCardId, selectedCardIds).has(cardId);
}
