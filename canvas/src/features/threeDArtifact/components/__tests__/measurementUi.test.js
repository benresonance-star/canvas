import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeasurementToolsHud, resolveMeasurementHudStyle } from '../MeasurementUi.jsx';

describe('resolveMeasurementHudStyle', () => {
  it('anchors the HUD below the ruler button', () => {
    const style = resolveMeasurementHudStyle({
      anchorRect: { left: 120, right: 148, top: 40, bottom: 64, width: 28, height: 24 },
      panelWidth: 192,
      panelHeight: 220,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(style).toEqual({
      position: 'fixed',
      left: 120,
      top: 77,
      zIndex: 60,
    });
  });

  it('flips above the button when there is not enough space below', () => {
    const style = resolveMeasurementHudStyle({
      anchorRect: { left: 120, right: 148, top: 700, bottom: 724, width: 28, height: 24 },
      panelWidth: 192,
      panelHeight: 220,
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(style.top).toBe(472);
  });

  it('renders measure and RL controls in a linear HUD panel', () => {
    const html = renderToStaticMarkup(
      React.createElement(MeasurementToolsHud, {
        measureKind: 'segment',
        measureSnapMode: 'vertex',
        enableRlOptions: true,
        rlDatum: { id: 'datum-1', position: [0, 0, 0], rlValue: 0 },
      }),
    );
    expect(html).toContain('Distance');
    expect(html).toContain('Height');
    expect(html).toContain('Datum');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="Cancel measurement"');
  });
});
