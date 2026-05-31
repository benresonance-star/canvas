import { isPointInRect } from './canvasView.js';

/** Reveal tray when dragging a card within this distance of viewport bottom */
export const TRAY_BOTTOM_PROXIMITY_PX = 120;

/** Extra padding around tray drop rect for easier drops */
export const TRAY_DROP_RECT_PAD_PX = 16;

/**
 * Fallback drop zone when tray DOM is not mounted (matches bottom-6 centered pill).
 * @param {number} [viewportWidth]
 * @param {number} [viewportHeight]
 */
export function getFallbackTrayDropRect(
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800,
) {
  const width = 320;
  const height = 72;
  const bottomOffset = 24;
  return {
    left: viewportWidth / 2 - width / 2,
    top: viewportHeight - bottomOffset - height,
    right: viewportWidth / 2 + width / 2,
    bottom: viewportHeight - bottomOffset,
  };
}

/**
 * @param {number} clientY
 * @param {number} [viewportHeight]
 */
export function isPointerNearTrayBottom(
  clientY,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800,
) {
  return clientY >= viewportHeight - TRAY_BOTTOM_PROXIMITY_PX;
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {number} [pad]
 */
export function isPointerInTrayDropZone(
  clientX,
  clientY,
  rect,
  pad = TRAY_DROP_RECT_PAD_PX,
) {
  const padded = {
    left: rect.left - pad,
    top: rect.top - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
  };
  return isPointInRect(clientX, clientY, padded);
}
