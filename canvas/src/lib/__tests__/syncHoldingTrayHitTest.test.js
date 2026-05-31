import { describe, expect, it } from 'vitest';
import {
  getFallbackTrayDropRect,
  isPointerInTrayDropZone,
  isPointerNearTrayBottom,
  TRAY_BOTTOM_PROXIMITY_PX,
} from '../syncHoldingTrayHitTest.js';

describe('syncHoldingTrayHitTest', () => {
  it('detects pointer near bottom of viewport', () => {
    const h = 800;
    expect(isPointerNearTrayBottom(h - TRAY_BOTTOM_PROXIMITY_PX, h)).toBe(true);
    expect(isPointerNearTrayBottom(h - TRAY_BOTTOM_PROXIMITY_PX - 1, h)).toBe(false);
  });

  it('returns centered fallback rect', () => {
    const rect = getFallbackTrayDropRect(1000, 800);
    expect(rect.left).toBe(340);
    expect(rect.right).toBe(660);
    expect(rect.bottom).toBe(776);
  });

  it('hit-tests padded drop zone', () => {
    const rect = { left: 100, top: 700, right: 420, bottom: 776 };
    expect(isPointerInTrayDropZone(200, 730, rect)).toBe(true);
    expect(isPointerInTrayDropZone(50, 730, rect)).toBe(false);
  });
});
