import { describe, expect, it } from 'vitest';
import {
  applyBimViewportToolbarLayout,
  BIM_VIEWPORT_CHROME_GAP_PX,
  resolveBimViewportHudTopPx,
} from '../bimViewportLayout.js';

describe('bimViewportLayout', () => {
  it('offsets HUD content below the measured toolbar bottom', () => {
    expect(resolveBimViewportHudTopPx(48)).toBe(48 + BIM_VIEWPORT_CHROME_GAP_PX);
  });

  it('writes toolbar and HUD CSS variables on the viewport container', () => {
    const properties = new Map();
    const container = {
      style: {
        setProperty(key, value) {
          properties.set(key, value);
        },
        getPropertyValue(key) {
          return properties.get(key) ?? '';
        },
      },
    };
    applyBimViewportToolbarLayout(container, 52);
    expect(container.style.getPropertyValue('--bim-viewport-toolbar-bottom')).toBe('52px');
    expect(container.style.getPropertyValue('--bim-viewport-hud-top')).toBe(`${52 + BIM_VIEWPORT_CHROME_GAP_PX}px`);
  });
});
