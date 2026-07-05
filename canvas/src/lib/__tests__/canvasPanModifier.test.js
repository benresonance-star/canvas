import { describe, expect, it } from 'vitest';
import {
  exceedsPanGestureThreshold,
  isCanvasPanModifier,
  isMiddleMouseButton,
  PAN_GESTURE_MOVE_PX,
  shouldIgnoreMiddleMousePan,
  shouldStartCanvasPan,
} from '../canvasPanModifier.js';

describe('canvasPanModifier', () => {
  it('isCanvasPanModifier is true when ctrl or meta is held', () => {
    expect(isCanvasPanModifier({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(isCanvasPanModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isCanvasPanModifier({ ctrlKey: true, metaKey: true })).toBe(true);
  });

  it('isCanvasPanModifier is false without ctrl or meta', () => {
    expect(isCanvasPanModifier({ ctrlKey: false, metaKey: false })).toBe(false);
    expect(isCanvasPanModifier(null)).toBe(false);
    expect(isCanvasPanModifier(undefined)).toBe(false);
  });

  it('isMiddleMouseButton is true only for button 1', () => {
    expect(isMiddleMouseButton({ button: 1 })).toBe(true);
    expect(isMiddleMouseButton({ button: 0 })).toBe(false);
    expect(isMiddleMouseButton({ button: 2 })).toBe(false);
  });

  it('shouldStartCanvasPan is true for ctrl/meta or middle mouse', () => {
    expect(shouldStartCanvasPan({ ctrlKey: true, button: 0 })).toBe(true);
    expect(shouldStartCanvasPan({ button: 1 })).toBe(true);
    expect(shouldStartCanvasPan({ button: 0 })).toBe(false);
  });

  it('shouldIgnoreMiddleMousePan skips scrollable artifact regions', () => {
    const child = {
      closest: (selector) => (selector === '[data-artifact-scroll]' ? { tagName: 'DIV' } : null),
    };
    expect(shouldIgnoreMiddleMousePan(child)).toBe(true);
    expect(shouldIgnoreMiddleMousePan({ closest: () => null })).toBe(false);
    expect(shouldIgnoreMiddleMousePan(null)).toBe(false);
  });

  it('exceedsPanGestureThreshold respects movement threshold', () => {
    const origin = { x: 100, y: 100 };
    expect(exceedsPanGestureThreshold(origin, 100, 100)).toBe(false);
    expect(
      exceedsPanGestureThreshold(
        origin,
        100 + PAN_GESTURE_MOVE_PX - 1,
        100,
      ),
    ).toBe(false);
    expect(
      exceedsPanGestureThreshold(
        origin,
        100 + PAN_GESTURE_MOVE_PX,
        100,
      ),
    ).toBe(true);
    expect(exceedsPanGestureThreshold(null, 120, 120)).toBe(false);
  });
});
