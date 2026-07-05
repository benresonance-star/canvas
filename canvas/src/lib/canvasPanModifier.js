/** Minimum pointer movement (px) before a pan suppresses the subsequent card click. */
export const PAN_GESTURE_MOVE_PX = 4;

/** Middle mouse button (scroll wheel press). */
export const CANVAS_PAN_MIDDLE_MOUSE_BUTTON = 1;

export function isCanvasPanModifier(e) {
  return Boolean(e?.ctrlKey || e?.metaKey);
}

export function isMiddleMouseButton(e) {
  return e?.button === CANVAS_PAN_MIDDLE_MOUSE_BUTTON;
}

/** Ctrl/Meta held or middle mouse pressed — start a canvas pan instead of card actions. */
export function shouldStartCanvasPan(e) {
  return isCanvasPanModifier(e) || isMiddleMouseButton(e);
}

/** Middle-mouse pan skips scrollable artifact bodies only. */
export function shouldIgnoreMiddleMousePan(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('[data-artifact-scroll]'));
}

export function exceedsPanGestureThreshold(origin, clientX, clientY) {
  if (!origin) return false;
  const dx = clientX - origin.x;
  const dy = clientY - origin.y;
  const thresholdSq = PAN_GESTURE_MOVE_PX * PAN_GESTURE_MOVE_PX;
  return dx * dx + dy * dy >= thresholdSq;
}
