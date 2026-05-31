import { CARD_TYPE_DEFAULT_SIZE } from './constants.js';

export function getCardPixelSize(card) {
  const d = CARD_TYPE_DEFAULT_SIZE[card.type] || CARD_TYPE_DEFAULT_SIZE.file;
  return { w: card.width ?? d.w, h: card.height ?? d.h };
}

/**
 * Viewport culling for render (full card list stays in React state).
 * @param {object[]} cards
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ margin?: number, disable?: boolean }} [opts]
 */
export function filterCardsForViewport(cards, view, viewportSize, opts = {}) {
  if (opts.disable || !cards?.length) return cards ?? [];
  if (!viewportSize?.width || !viewportSize?.height) return cards;
  const margin = opts.margin ?? 480;
  const z = view?.zoom > 0 ? view.zoom : 1;
  const minX = -view.x / z - margin;
  const minY = -view.y / z - margin;
  const maxX = minX + viewportSize.width / z + margin * 2;
  const maxY = minY + viewportSize.height / z + margin * 2;
  return cards.filter((c) => {
    const { w, h } = getCardPixelSize(c);
    return c.x + w >= minX && c.x <= maxX && c.y + h >= minY && c.y <= maxY;
  });
}