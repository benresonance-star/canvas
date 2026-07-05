import { describe, expect, it } from 'vitest';
import {
  applyCanvasWheelPan,
  applyCanvasWheelZoom,
  resolveCanvasWheelAction,
} from '../canvasWheelInteraction.js';
import { clampCanvasZoom } from '../canvasView.js';

describe('resolveCanvasWheelAction', () => {
  it('zooms on plain scroll wheel input', () => {
    expect(resolveCanvasWheelAction({ shiftKey: false })).toBe('zoom');
  });

  it('pans when shift is held', () => {
    expect(resolveCanvasWheelAction({ shiftKey: true })).toBe('pan');
  });
});

describe('applyCanvasWheelZoom', () => {
  it('zooms toward the pointer while keeping the world point under the cursor fixed', () => {
    const view = { x: 100, y: 50, zoom: 1 };
    const rect = { left: 0, top: 0 };
    const clientX = 200;
    const clientY = 150;
    const next = applyCanvasWheelZoom(
      view,
      { deltaY: -100, clientX, clientY, ...rect },
      clampCanvasZoom,
    );
    expect(next.zoom).toBeGreaterThan(view.zoom);

    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const worldBefore = {
      x: (mx - view.x) / view.zoom,
      y: (my - view.y) / view.zoom,
    };
    const worldAfter = {
      x: (mx - next.x) / next.zoom,
      y: (my - next.y) / next.zoom,
    };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
  });
});

describe('applyCanvasWheelPan', () => {
  it('translates the view by wheel deltas', () => {
    const view = { x: 10, y: 20, zoom: 1.5 };
    expect(applyCanvasWheelPan(view, { deltaX: 5, deltaY: 8 })).toEqual({
      x: 5,
      y: 12,
      zoom: 1.5,
    });
  });
});
