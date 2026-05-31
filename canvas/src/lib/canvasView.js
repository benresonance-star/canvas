import { getCardPixelSize } from './cards.js';

export const CANVAS_ZOOM_MIN = 0.1;
export const CANVAS_ZOOM_MAX = 3;

export const CANVAS_ZOOM_PERCENT_MIN = Math.round(CANVAS_ZOOM_MIN * 100);
export const CANVAS_ZOOM_PERCENT_MAX = Math.round(CANVAS_ZOOM_MAX * 100);

export function clampCanvasZoom(zoom) {
  return Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, zoom));
}

/**
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ left: number, top: number }} canvasRect
 * @param {number} clientX
 * @param {number} clientY
 */
export function clientToWorldPoint(view, canvasRect, clientX, clientY) {
  return {
    x: (clientX - canvasRect.left - view.x) / view.zoom,
    y: (clientY - canvasRect.top - view.y) / view.zoom,
  };
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 */
export function isPointInRect(clientX, clientY, rect) {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function clampZoomPercent(percent) {
  return Math.max(CANVAS_ZOOM_PERCENT_MIN, Math.min(CANVAS_ZOOM_PERCENT_MAX, percent));
}

/** @param {string} raw */
export function parseZoomPercentInput(raw) {
  const trimmed = String(raw).trim().replace(/%$/, '').trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

/**
 * @param {Array<{ x: number, y: number, width?: number, height?: number, type?: string }>} cards
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } | null}
 */
export function computeCardsWorldBounds(cards) {
  if (!cards?.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const card of cards) {
    const { w, h } = getCardPixelSize(card);
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + w);
    maxY = Math.max(maxY, card.y + h);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return { minX, minY, maxX, maxY, width, height };
}

/**
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {number} zoom
 * @param {{ width: number, height: number }} viewportSize
 */
export function setViewZoomAtViewportCenter(view, zoom, viewportSize) {
  const clampedZoom = clampCanvasZoom(zoom);
  const { width, height } = viewportSize;
  if (width <= 0 || height <= 0) {
    return { ...view, zoom: clampedZoom };
  }

  const mx = width / 2;
  const my = height / 2;
  const worldX = (mx - view.x) / view.zoom;
  const worldY = (my - view.y) / view.zoom;

  return {
    x: mx - worldX * clampedZoom,
    y: my - worldY * clampedZoom,
    zoom: clampedZoom,
  };
}

/** Bottom reserve for zoom controls (fixed bottom-6 left pill). */
export const CANVAS_CHROME_BOTTOM_RESERVE_PX = 72;

/** Estimated sync tray + hint when DOM rect is not measured yet. */
export const SYNC_TRAY_FALLBACK_BOTTOM_RESERVE_PX = 132;

/** Margin between fitted cards and fixed chrome (screen px). */
export const CANVAS_CHROME_CLEARANCE_PX = 12;

/** Left/right inset when fitting all cards (reset view / zoom to extent). */
export const CANVAS_FIT_HORIZONTAL_PADDING_PX = 160;

/** Top inset when fitting all cards (reset view / zoom to extent). */
export const CANVAS_FIT_TOP_PADDING_PX = 96;

/** Desktop footer chrome — matches CanvasChrome fixed bottom-6 layout. */
export const DESKTOP_CHROME_EDGE_PX = 24;
export const DESKTOP_CHROME_LEFT_WIDTH_PX = 196;
export const DESKTOP_CHROME_LEFT_HEIGHT_PX = 44;
export const DESKTOP_CHROME_RIGHT_WIDTH_PX = 336;
export const DESKTOP_CHROME_RIGHT_HEIGHT_PX = 156;

/**
 * Padding for fit-to-extent so cards stay above docked UI (tray, chrome).
 * @param {number} viewportHeight
 * @param {{ trayVisible?: boolean, trayDropRect?: { top: number } | null }} [ui]
 * @param {{ padding?: number, margin?: number }} [options]
 */
export function canvasFitInsets(
  viewportHeight,
  { trayVisible = false, trayDropRect = null } = {},
  {
    padding = CANVAS_FIT_TOP_PADDING_PX,
    horizontalPadding = CANVAS_FIT_HORIZONTAL_PADDING_PX,
    margin = 16,
  } = {},
) {
  let paddingBottom = Math.max(padding, CANVAS_CHROME_BOTTOM_RESERVE_PX);
  if (trayVisible) {
    if (trayDropRect && viewportHeight > 0) {
      paddingBottom = Math.max(
        paddingBottom,
        viewportHeight - trayDropRect.top + margin,
      );
    } else {
      paddingBottom = Math.max(paddingBottom, SYNC_TRAY_FALLBACK_BOTTOM_RESERVE_PX);
    }
  }
  return {
    paddingTop: padding,
    paddingRight: horizontalPadding,
    paddingBottom,
    paddingLeft: horizontalPadding,
    trayVisible,
    trayDropRect,
  };
}

/**
 * Screen-space exclusion zones for fixed desktop chrome (viewport coordinates).
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ trayVisible?: boolean, trayDropRect?: { top: number } | null }} [ui]
 * @returns {Array<{ left: number, top: number, right: number, bottom: number }>}
 */
export function desktopChromeExclusionZones(
  viewportSize,
  { trayVisible = false, trayDropRect = null } = {},
) {
  const { width: vw, height: vh } = viewportSize;
  if (vw <= 0 || vh <= 0) return [];

  const edge = DESKTOP_CHROME_EDGE_PX;
  const zones = [
    {
      left: 0,
      top: vh - edge - DESKTOP_CHROME_LEFT_HEIGHT_PX,
      right: edge + DESKTOP_CHROME_LEFT_WIDTH_PX,
      bottom: vh,
    },
    {
      left: vw - edge - DESKTOP_CHROME_RIGHT_WIDTH_PX,
      top: vh - edge - DESKTOP_CHROME_RIGHT_HEIGHT_PX,
      right: vw,
      bottom: vh,
    },
  ];

  if (trayVisible) {
    const trayTop =
      trayDropRect?.top != null
        ? trayDropRect.top
        : vh - SYNC_TRAY_FALLBACK_BOTTOM_RESERVE_PX;
    zones.push({ left: 0, top: trayTop, right: vw, bottom: vh });
  }

  return zones;
}

/**
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 */
function worldBoundsToScreen(view, bounds) {
  const { x, y, zoom } = view;
  return {
    left: bounds.minX * zoom + x,
    top: bounds.minY * zoom + y,
    right: bounds.maxX * zoom + x,
    bottom: bounds.maxY * zoom + y,
  };
}

/**
 * How far (screen px) the fitted bounds extend below the top of bottom footer chrome.
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ trayVisible?: boolean, trayDropRect?: { top: number } | null }} [ui]
 */
export function measureBottomChromeEncroachment(view, bounds, viewportSize, ui = {}) {
  const zones = desktopChromeExclusionZones(viewportSize, ui);
  if (zones.length === 0) return 0;

  const chromeTop = Math.min(...zones.map((z) => z.top));
  const margin = CANVAS_CHROME_CLEARANCE_PX;
  const screen = worldBoundsToScreen(view, bounds);
  if (screen.bottom <= chromeTop - margin) return 0;
  return screen.bottom - (chromeTop - margin);
}

/**
 * Pan in the bottom footer band only — avoids breaking fit-to-extent for centered layouts.
 * @param {{ x: number, y: number, zoom: number }} view
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ trayVisible?: boolean, trayDropRect?: { top: number } | null }} [ui]
 */
export function nudgeViewClearOfDesktopChrome(view, bounds, viewportSize, ui = {}) {
  const zones = desktopChromeExclusionZones(viewportSize, ui);
  if (zones.length === 0) return view;

  const chromeTop = Math.min(...zones.map((z) => z.top));
  const rightZone = zones.find((z) => z.right === viewportSize.width);
  const leftZone = zones.find((z) => z.left === 0);
  const margin = CANVAS_CHROME_CLEARANCE_PX;

  let { x, y, zoom } = view;

  let screen = worldBoundsToScreen({ x, y, zoom }, bounds);
  if (screen.bottom > chromeTop - margin) {
    y += chromeTop - margin - screen.bottom;
  }

  screen = worldBoundsToScreen({ x, y, zoom }, bounds);
  if (screen.bottom > chromeTop - margin) {
    if (rightZone && screen.right > rightZone.left - margin) {
      x += rightZone.left - margin - screen.right;
    }
    screen = worldBoundsToScreen({ x, y, zoom }, bounds);
    if (leftZone && screen.left < leftZone.right + margin) {
      x += leftZone.right + margin - screen.left;
    }
  }

  return { x, y, zoom };
}

/**
 * Whether to auto-fit cards on project load (missing/invalid view only).
 * @param {{ x?: number, y?: number, zoom?: number } | null | undefined} canvasView
 * @param {Array<unknown>} [cards]
 */
export function shouldAutoFitCanvasOnLoad(canvasView, cards = []) {
  if (!cards?.length) return false;
  if (
    !canvasView
    || !Number.isFinite(canvasView.x)
    || !Number.isFinite(canvasView.y)
    || !Number.isFinite(canvasView.zoom)
  ) {
    return true;
  }
  return false;
}

/**
 * Pan/zoom that fits all cards in the viewport (reset view / zoom to extents).
 * @param {Array<{ x: number, y: number, width?: number, height?: number, type?: string }>} cards
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ padding?: number, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number, trayVisible?: boolean, trayDropRect?: { top: number } | null }} [options]
 */
export function canvasViewForCards(cards, viewportSize, options = {}) {
  const {
    trayVisible = false,
    trayDropRect = null,
    clearDesktopChrome = true,
    ...fitOptions
  } = options;
  const bounds = computeCardsWorldBounds(cards);
  if (!bounds) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const chromeUi = { trayVisible, trayDropRect };
  let mergedFit = { ...fitOptions };

  let view = fitCanvasViewToExtent(bounds, viewportSize, mergedFit);

  if (clearDesktopChrome) {
    for (let i = 0; i < 4; i += 1) {
      const encroach = measureBottomChromeEncroachment(
        view,
        bounds,
        viewportSize,
        chromeUi,
      );
      if (encroach <= 0) break;
      const baseBottom = mergedFit.paddingBottom ?? mergedFit.padding ?? 48;
      mergedFit = {
        ...mergedFit,
        paddingBottom: baseBottom + encroach,
      };
      view = fitCanvasViewToExtent(bounds, viewportSize, mergedFit);
    }
    view = nudgeViewClearOfDesktopChrome(view, bounds, viewportSize, chromeUi);
  }

  return view;
}

/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }} bounds
 * @param {{ width: number, height: number }} viewportSize
 * @param {{ padding?: number, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number }} [options]
 */
export function fitCanvasViewToExtent(bounds, viewportSize, options = {}) {
  const { padding = 48 } = options;
  const paddingTop = options.paddingTop ?? padding;
  const paddingRight = options.paddingRight ?? padding;
  const paddingBottom = options.paddingBottom ?? padding;
  const paddingLeft = options.paddingLeft ?? padding;
  const { width: vw, height: vh } = viewportSize;

  if (vw <= 0 || vh <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const innerW = Math.max(1, vw - paddingLeft - paddingRight);
  const innerH = Math.max(1, vh - paddingTop - paddingBottom);
  const zoom = clampCanvasZoom(
    Math.min(innerW / bounds.width, innerH / bounds.height),
  );

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const centerX = paddingLeft + innerW / 2;
  const centerY = paddingTop + innerH / 2;

  return {
    x: centerX - cx * zoom,
    y: centerY - cy * zoom,
    zoom,
  };
}
