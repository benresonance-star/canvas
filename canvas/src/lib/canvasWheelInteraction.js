/** Scroll wheel zoom sensitivity (multiplied by normalized deltaY). */
export const CANVAS_WHEEL_ZOOM_FACTOR = 0.002;

/**
 * @param {WheelEvent | { shiftKey?: boolean }} e
 * @returns {'zoom' | 'pan'}
 */
export function resolveCanvasWheelAction(e) {
  if (e?.shiftKey) return 'pan';
  return 'zoom';
}

/**
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ deltaY: number, clientX: number, clientY: number, left: number, top: number }} params
 * @param {(zoom: number) => number} [clampZoom]
 */
export function applyCanvasWheelZoom(
  view,
  { deltaY, clientX, clientY, left, top },
  clampZoom = (zoom) => zoom,
) {
  const delta = -deltaY * CANVAS_WHEEL_ZOOM_FACTOR;
  const newZoom = clampZoom(view.zoom * (1 + delta));
  const mx = clientX - left;
  const my = clientY - top;
  const worldX = (mx - view.x) / view.zoom;
  const worldY = (my - view.y) / view.zoom;
  return {
    x: mx - worldX * newZoom,
    y: my - worldY * newZoom,
    zoom: newZoom,
  };
}

/**
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ deltaX: number, deltaY: number }} deltas
 */
export function applyCanvasWheelPan(view, { deltaX, deltaY }) {
  return {
    ...view,
    x: view.x - deltaX,
    y: view.y - deltaY,
  };
}
