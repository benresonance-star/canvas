import { getCardPixelSize } from './cards.js';
import { resolveThreadForCard } from './agentChatThreads.js';

/**
 * @param {object} card
 */
export function cardLabel(card) {
  return card.name || card.key || 'Untitled';
}

/**
 * @param {object[]} cards
 * @param {Set<string>} selectedCardIds
 */
export function cardsFromSelection(cards, selectedCardIds) {
  if (!selectedCardIds?.size) return [];
  return cards.filter((c) => selectedCardIds.has(c.id));
}

/**
 * World-space viewport rect from canvas DOM rect and pan/zoom.
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ x: number, y: number, zoom: number }} canvasView
 */
export function worldViewportRect(viewportSize, canvasView) {
  const { width, height } = viewportSize;
  const { x, y, zoom } = canvasView;
  if (!width || !height || !zoom) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX: -x / zoom,
    minY: -y / zoom,
    maxX: (-x + width) / zoom,
    maxY: (-y + height) / zoom,
  };
}

function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Cards whose bounds intersect the visible world viewport.
 * @param {object[]} cards
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ x: number, y: number, zoom: number }} canvasView
 */
export function cardsInViewport(cards, viewportSize, canvasView) {
  const vp = worldViewportRect(viewportSize, canvasView);
  const visible = [];
  for (const card of cards) {
    const { w, h } = getCardPixelSize(card);
    const cardRect = {
      minX: card.x,
      minY: card.y,
      maxX: card.x + w,
      maxY: card.y + h,
    };
    if (rectsOverlap(vp, cardRect)) visible.push(card);
  }
  return visible;
}

/**
 * @param {'selected' | 'visible'} mode
 * @param {object[]} cards
 * @param {Set<string>} selectedCardIds
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ x: number, y: number, zoom: number }} canvasView
 */
export function resolveAgentContextCards(mode, cards, selectedCardIds, viewportSize, canvasView) {
  if (mode === 'visible') {
    return cardsInViewport(cards, viewportSize, canvasView);
  }
  return cardsFromSelection(cards, selectedCardIds);
}

/**
 * @param {object} card
 * @param {{ activeThreadId?: string | null, threadIndex?: { threads?: object[] } | null, connectorId?: string | null }} [opts]
 */
export function isThreadChatContextCard(card, opts = {}) {
  if (!card || card.type !== 'agent_chat') return false;
  const { activeThreadId, threadIndex, connectorId } = opts;
  if (!connectorId || !threadIndex?.threads?.length) return false;
  const thread = resolveThreadForCard(threadIndex, card, connectorId);
  if (!thread) return false;
  if (activeThreadId) return thread.threadId === activeThreadId;
  return true;
}

/**
 * @param {object[]} cards
 * @param {{ activeThreadId?: string | null, threadIndex?: object | null, connectorId?: string | null }} [opts]
 */
export function excludeThreadChatCardsFromContext(cards, opts = {}) {
  return (cards ?? []).filter((c) => !isThreadChatContextCard(c, opts));
}

/**
 * @param {{ byCardId?: Map<string, object> }} registry
 * @param {object[]} allCards
 */
export function cardsFromContextRegistry(registry, allCards) {
  if (!registry?.byCardId?.size) return [];
  const byId = new Map((allCards ?? []).map((c) => [c.id, c]));
  const out = [];
  for (const cardId of registry.byCardId.keys()) {
    const card = byId.get(cardId);
    if (card) out.push(card);
  }
  return out;
}

/**
 * @param {object[][]} lists
 */
export function mergeContextCardsById(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const card of list ?? []) {
      if (!card?.id || seen.has(card.id)) continue;
      seen.add(card.id);
      merged.push(card);
    }
  }
  return merged;
}

/**
 * Canvas selection/viewport plus persisted thread registry, excluding thread chat cards.
 * @param {{
 *   mode: 'selected' | 'visible',
 *   cards: object[],
 *   selectedCardIds: Set<string>,
 *   viewportSize: { width: number, height: number },
 *   canvasView: { x: number, y: number, zoom: number },
 *   registry?: { byCardId?: Map<string, object> } | null,
 *   activeThreadId?: string | null,
 *   threadIndex?: { threads?: object[] } | null,
 *   connectorId?: string | null,
 * }} params
 */
export function resolveEffectiveAgentContextCards({
  mode,
  cards,
  selectedCardIds,
  viewportSize,
  canvasView,
  registry = null,
  activeThreadId = null,
  threadIndex = null,
  connectorId = null,
}) {
  const threadOpts = { activeThreadId, threadIndex, connectorId };
  const fromMode = resolveAgentContextCards(
    mode,
    cards,
    selectedCardIds,
    viewportSize,
    canvasView,
  );
  const fromRegistry = cardsFromContextRegistry(registry, cards);
  const merged = mergeContextCardsById(fromRegistry, fromMode);
  return excludeThreadChatCardsFromContext(merged, threadOpts);
}
