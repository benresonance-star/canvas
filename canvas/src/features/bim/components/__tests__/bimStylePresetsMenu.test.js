import { describe, expect, it } from 'vitest';
import { resolveStylePresetPanelStyle } from '../BimStylePresetsMenu.jsx';

describe('resolveStylePresetPanelStyle', () => {
  const anchorRect = {
    top: 120,
    right: 400,
    bottom: 148,
    left: 372,
  };

  it('opens below the trigger and right-aligns when there is room', () => {
    const style = resolveStylePresetPanelStyle({
      anchorRect,
      panelWidth: 288,
      panelHeight: 220,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(style).toEqual({
      position: 'fixed',
      left: 112,
      top: 156,
      zIndex: 60,
    });
  });

  it('flips above the trigger when the panel would overflow the viewport bottom', () => {
    const style = resolveStylePresetPanelStyle({
      anchorRect: { top: 700, right: 400, bottom: 728, left: 372 },
      panelWidth: 288,
      panelHeight: 220,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(style?.top).toBe(472);
    expect(style?.left).toBe(112);
  });

  it('clamps the panel inside the viewport margins', () => {
    const style = resolveStylePresetPanelStyle({
      anchorRect: { top: 20, right: 40, bottom: 48, left: 12 },
      panelWidth: 288,
      panelHeight: 220,
      viewportWidth: 320,
      viewportHeight: 240,
    });
    expect(style?.left).toBe(8);
    expect(style?.top).toBe(8);
  });
});
