import { describe, expect, it } from 'vitest';
import {
  applyBimViewportToolbarLayout,
  BIM_VIEWPORT_BOTTOM_INSET_PX,
  BIM_VIEWPORT_CHROME_GAP_PX,
  BIM_VIEWPORT_DISPLAY_TOOLBAR_BUTTON_ACTIVE_CLASS,
  BIM_VIEWPORT_HUD_TOP_PX,
  bimViewportDisplayToolbarButtonClass,
  resolveBimLayersHudMaxHeightPx,
  resolveBimViewportHudTopPx,
  resolveBimViewportRightHudTopPx,
} from '../bimViewportLayout.js';

describe('bimViewportLayout', () => {
  it('offsets HUD content below the measured toolbar bottom', () => {
    expect(resolveBimViewportHudTopPx(48)).toBe(48 + BIM_VIEWPORT_CHROME_GAP_PX);
  });

  it('offsets the right HUD stack below the measured gimbal bottom', () => {
    expect(resolveBimViewportRightHudTopPx(52)).toBe(52 + BIM_VIEWPORT_CHROME_GAP_PX);
  });

  it('limits layers HUD height to the space above the view carousel', () => {
    expect(resolveBimLayersHudMaxHeightPx({
      viewportHeight: 800,
      carouselTopPx: 620,
    })).toBe(620 - BIM_VIEWPORT_HUD_TOP_PX - BIM_VIEWPORT_CHROME_GAP_PX);
    expect(resolveBimLayersHudMaxHeightPx({
      viewportHeight: 800,
    })).toBe(800 - BIM_VIEWPORT_HUD_TOP_PX - BIM_VIEWPORT_BOTTOM_INSET_PX - BIM_VIEWPORT_CHROME_GAP_PX);
  });

  it('uses bright blue classes for active display toolbar buttons', () => {
    expect(bimViewportDisplayToolbarButtonClass(true)).toBe(BIM_VIEWPORT_DISPLAY_TOOLBAR_BUTTON_ACTIVE_CLASS);
    expect(bimViewportDisplayToolbarButtonClass(true)).toContain('bg-bim-toolbar-active');
    expect(bimViewportDisplayToolbarButtonClass(false)).not.toContain('bg-accent');
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
    expect(container.style.getPropertyValue('--bim-viewport-right-hud-top')).toBe(`${52 + BIM_VIEWPORT_CHROME_GAP_PX}px`);
  });

  it('writes the right HUD top below the measured gimbal bottom', () => {
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
    applyBimViewportToolbarLayout(container, 52, 64);
    expect(container.style.getPropertyValue('--bim-viewport-hud-top')).toBe(`${52 + BIM_VIEWPORT_CHROME_GAP_PX}px`);
    expect(container.style.getPropertyValue('--bim-viewport-right-hud-top')).toBe(`${64 + BIM_VIEWPORT_CHROME_GAP_PX}px`);
  });
});
