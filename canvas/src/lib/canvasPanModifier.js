/** Minimum pointer movement (px) before a pan suppresses the subsequent card click. */
export const PAN_GESTURE_MOVE_PX = 4;

export function isCanvasPanModifier(e) {
  return Boolean(e?.ctrlKey || e?.metaKey);
}

export function exceedsPanGestureThreshold(origin, clientX, clientY) {
  if (!origin) return false;
  const dx = clientX - origin.x;
  const dy = clientY - origin.y;
  const thresholdSq = PAN_GESTURE_MOVE_PX * PAN_GESTURE_MOVE_PX;
  return dx * dx + dy * dy >= thresholdSq;
}
