/**
 * Resolve placement for a newly created canvas card.
 * @param {{ pendingPlacement?: { x: number, y: number } | null, cardCount?: number, canvasView?: object, viewportSize?: { width: number, height: number }, offset?: { x: number, y: number }, mode?: 'grid' | 'center' }} input
 */
export function resolveNewCardPosition({
  pendingPlacement = null,
  cardCount = 0,
  canvasView = { x: 0, y: 0, zoom: 1 },
  viewportSize = { width: 0, height: 0 },
  offset = { x: 0, y: 0 },
  mode = 'grid',
} = {}) {
  if (
    pendingPlacement
    && Number.isFinite(pendingPlacement.x)
    && Number.isFinite(pendingPlacement.y)
  ) {
    return { x: pendingPlacement.x, y: pendingPlacement.y, usedPending: true };
  }
  if (mode === 'center' && viewportSize.width > 0 && viewportSize.height > 0) {
    const zoom = canvasView.zoom || 1;
    return {
      x: (viewportSize.width / 2 - canvasView.x) / zoom + offset.x,
      y: (viewportSize.height / 2 - canvasView.y) / zoom + offset.y,
      usedPending: false,
    };
  }
  return {
    x: 100 + (cardCount % 4) * 320,
    y: 100 + Math.floor(cardCount / 4) * 240,
    usedPending: false,
  };
}
