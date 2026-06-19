import { describe, expect, it } from 'vitest';
import {
  exceedsPanGestureThreshold,
  isCanvasPanModifier,
  PAN_GESTURE_MOVE_PX,
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
