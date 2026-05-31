/** @param {Element | null} canvasEl */
export function beginCardDragSession(canvasEl, cardId) {
  if (!canvasEl) return;

  canvasEl.setAttribute('data-card-dragging', '');

  const escaped =
    typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(cardId)
      : String(cardId).replace(/"/g, '\\"');
  const host = canvasEl.querySelector(`[data-card-id="${escaped}"]`);
  host?.setAttribute('data-dragging-card', '');
}

/** @param {Element | null} canvasEl */
export function endCardDragSession(canvasEl) {
  if (!canvasEl) return;

  canvasEl.removeAttribute('data-card-dragging');
  canvasEl.querySelectorAll('[data-dragging-card]').forEach((el) => {
    el.removeAttribute('data-dragging-card');
  });
}
