/** Ref-counted guard: true while user is dragging, panning, or resizing on canvas. */

let interactionDepth = 0;

export function beginCanvasInteraction(_kind) {
  interactionDepth += 1;
}

export function endCanvasInteraction(_kind) {
  const wasActive = interactionDepth > 0;
  interactionDepth = Math.max(0, interactionDepth - 1);
  if (wasActive && interactionDepth === 0) {
    import('./actionSync.js')
      .then(({ flushPendingFolderScanIfAny }) => flushPendingFolderScanIfAny())
      .catch(() => {});
  }
}

export function isCanvasInteractionActive() {
  return interactionDepth > 0;
}

/** @internal */
export function resetCanvasInteractionForTests() {
  interactionDepth = 0;
}
