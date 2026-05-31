import { describe, expect, it } from 'vitest';
import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  clampCanvasZoom,
  clampZoomPercent,
  clientToWorldPoint,
  computeCardsWorldBounds,
  canvasFitInsets,
  nudgeViewClearOfDesktopChrome,
  measureBottomChromeEncroachment,
  desktopChromeExclusionZones,
  canvasViewForCards,
  shouldAutoFitCanvasOnLoad,
  computeCardsWorldBounds,
  fitCanvasViewToExtent,
  isPointInRect,
  parseZoomPercentInput,
  setViewZoomAtViewportCenter,
} from '../canvasView.js';

describe('clientToWorldPoint', () => {
  it('converts client coordinates using view and canvas rect', () => {
    const view = { x: 100, y: 50, zoom: 2 };
    const rect = { left: 10, top: 20 };
    const world = clientToWorldPoint(view, rect, 210, 170);
    expect(world.x).toBe(50);
    expect(world.y).toBe(50);
  });
});

describe('isPointInRect', () => {
  it('returns true when point is inside rect', () => {
    const rect = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(isPointInRect(50, 50, rect)).toBe(true);
    expect(isPointInRect(101, 50, rect)).toBe(false);
  });
});

describe('clampCanvasZoom', () => {
  it('clamps to min and max', () => {
    expect(clampCanvasZoom(0.05)).toBe(CANVAS_ZOOM_MIN);
    expect(clampCanvasZoom(5)).toBe(CANVAS_ZOOM_MAX);
    expect(clampCanvasZoom(1)).toBe(1);
  });
});

describe('clampZoomPercent', () => {
  it('clamps to 10–300', () => {
    expect(clampZoomPercent(5)).toBe(10);
    expect(clampZoomPercent(10)).toBe(10);
    expect(clampZoomPercent(400)).toBe(300);
    expect(clampZoomPercent(50)).toBe(50);
  });
});

describe('parseZoomPercentInput', () => {
  it('parses plain numbers and percent suffix', () => {
    expect(parseZoomPercentInput('34')).toBe(34);
    expect(parseZoomPercentInput('  50% ')).toBe(50);
  });

  it('returns null for invalid input', () => {
    expect(parseZoomPercentInput('')).toBeNull();
    expect(parseZoomPercentInput('abc')).toBeNull();
  });
});

describe('computeCardsWorldBounds', () => {
  it('returns null for empty cards', () => {
    expect(computeCardsWorldBounds([])).toBeNull();
  });

  it('unions card rectangles', () => {
    const bounds = computeCardsWorldBounds([
      { x: 0, y: 0, type: 'file', width: 100, height: 80 },
      { x: 200, y: 50, type: 'file', width: 50, height: 50 },
    ]);
    expect(bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 250,
      maxY: 100,
      width: 250,
      height: 100,
    });
  });

  it('guards zero-size bounds to at least 1px', () => {
    const bounds = computeCardsWorldBounds([
      { x: 10, y: 20, type: 'file', width: 0, height: 0 },
    ]);
    expect(bounds.width).toBe(1);
    expect(bounds.height).toBe(1);
  });
});

describe('setViewZoomAtViewportCenter', () => {
  it('keeps viewport center world point fixed', () => {
    const view = { x: 100, y: 50, zoom: 1 };
    const viewport = { width: 800, height: 600 };
    const next = setViewZoomAtViewportCenter(view, 2, viewport);

    const mx = 400;
    const my = 300;
    const worldBeforeX = (mx - view.x) / view.zoom;
    const worldBeforeY = (my - view.y) / view.zoom;
    const worldAfterX = (mx - next.x) / next.zoom;
    const worldAfterY = (my - next.y) / next.zoom;

    expect(worldAfterX).toBeCloseTo(worldBeforeX);
    expect(worldAfterY).toBeCloseTo(worldBeforeY);
    expect(next.zoom).toBe(2);
  });
});

describe('shouldAutoFitCanvasOnLoad', () => {
  it('returns false when there are no cards', () => {
    expect(shouldAutoFitCanvasOnLoad({ x: 0, y: 0, zoom: 1 }, [])).toBe(false);
    expect(shouldAutoFitCanvasOnLoad(null, [])).toBe(false);
  });

  it('returns true when cards exist but view is missing or invalid', () => {
    expect(shouldAutoFitCanvasOnLoad(null, [{ x: 0, y: 0 }])).toBe(true);
    expect(shouldAutoFitCanvasOnLoad({ x: NaN, y: 0, zoom: 1 }, [{ x: 0 }])).toBe(true);
  });

  it('returns false when a valid view is persisted', () => {
    expect(
      shouldAutoFitCanvasOnLoad({ x: 120, y: -40, zoom: 0.85 }, [{ x: 0, y: 0 }]),
    ).toBe(false);
    expect(
      shouldAutoFitCanvasOnLoad({ x: 0, y: 0, zoom: 1 }, [{ x: 0, y: 0 }]),
    ).toBe(false);
  });
});

describe('canvasViewForCards', () => {
  it('returns default view when there are no cards', () => {
    expect(canvasViewForCards([], { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it('fits card bounds in the viewport', () => {
    const cards = [{ x: 0, y: 0, width: 200, height: 100, type: 'note' }];
    const view = canvasViewForCards(cards, { width: 1000, height: 800 }, { padding: 0 });
    expect(view.zoom).toBeGreaterThan(0);
    expect(view.x).toBeDefined();
    expect(view.y).toBeDefined();
  });

  it('zooms to extent then clears bottom chrome without huge side padding', () => {
    const cards = [
      { x: 0, y: 0, type: 'html' },
      { x: 800, y: 600, type: 'markdown' },
    ];
    const viewport = { width: 1200, height: 800 };
    const plain = fitCanvasViewToExtent(
      computeCardsWorldBounds(cards),
      viewport,
      { padding: 48, paddingBottom: 72 },
    );
    const withChrome = canvasViewForCards(cards, viewport, {
      padding: 48,
      paddingBottom: 72,
      clearDesktopChrome: true,
    });
    expect(withChrome.zoom).toBeGreaterThan(0);
    expect(withChrome.zoom).toBeLessThanOrEqual(plain.zoom);
  });
});

describe('canvasFitInsets', () => {
  it('reserves chrome bottom padding by default', () => {
    const insets = canvasFitInsets(800, { trayVisible: false });
    expect(insets.paddingBottom).toBeGreaterThanOrEqual(72);
  });

  it('uses symmetric horizontal padding for fit zoom', () => {
    const insets = canvasFitInsets(800, { trayVisible: false });
    expect(insets.paddingLeft).toBe(160);
    expect(insets.paddingRight).toBe(160);
    expect(insets.paddingTop).toBe(96);
  });

  it('reserves space above tray from measured drop rect', () => {
    const insets = canvasFitInsets(800, {
      trayVisible: true,
      trayDropRect: { top: 700 },
    });
    expect(insets.paddingBottom).toBe(116);
  });
});

describe('nudgeViewClearOfDesktopChrome', () => {
  it('pans up when bounds overlap right footer without changing zoom', () => {
    const bounds = {
      minX: 800,
      minY: 550,
      maxX: 1100,
      maxY: 750,
      width: 300,
      height: 200,
    };
    const viewport = { width: 1200, height: 800 };
    const view = { x: 0, y: 0, zoom: 1 };
    const nudged = nudgeViewClearOfDesktopChrome(view, bounds, viewport, {});
    expect(nudged.zoom).toBe(1);
    expect(nudged.y).toBeLessThan(view.y);
  });

  it('does not pan horizontally when cards are above the footer band', () => {
    const bounds = { minX: 100, minY: 50, maxX: 900, maxY: 400, width: 800, height: 350 };
    const viewport = { width: 1200, height: 800 };
    const view = fitCanvasViewToExtent(bounds, viewport, { padding: 48 });
    const nudged = nudgeViewClearOfDesktopChrome(view, bounds, viewport, {});
    expect(nudged.x).toBeCloseTo(view.x, 0);
  });

  it('defines left and right chrome zones', () => {
    const zones = desktopChromeExclusionZones({ width: 1000, height: 800 });
    expect(zones.length).toBeGreaterThanOrEqual(2);
    expect(zones[0].right).toBeLessThan(zones[1].left);
  });
});

describe('measureBottomChromeEncroachment', () => {
  it('returns 0 when bounds sit above footer chrome', () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 };
    const viewport = { width: 1200, height: 800 };
    const view = { x: 0, y: 0, zoom: 1 };
    expect(measureBottomChromeEncroachment(view, bounds, viewport, {})).toBe(0);
  });
});

describe('fitCanvasViewToExtent', () => {
  it('fits bounds centered in viewport', () => {
    const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 500, width: 1000, height: 500 };
    const view = fitCanvasViewToExtent(bounds, { width: 1000, height: 800 }, { padding: 0 });

    expect(view.zoom).toBeCloseTo(1);
    expect(view.x).toBeCloseTo(0);
    expect(view.y).toBeCloseTo(150);
  });

  it('shifts center upward when bottom padding is larger', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    const symmetric = fitCanvasViewToExtent(
      bounds,
      { width: 400, height: 400 },
      { padding: 48 },
    );
    const withDock = fitCanvasViewToExtent(
      bounds,
      { width: 400, height: 400 },
      { padding: 48, paddingBottom: 160 },
    );
    expect(withDock.y).toBeLessThan(symmetric.y);
  });

  it('returns default when viewport is zero', () => {
    expect(fitCanvasViewToExtent(
      { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
      { width: 0, height: 0 },
    )).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
