import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeasurementToolsHud, MeasurementsListPanel, countMeasurementHudEntries, resolveMeasurementHudStyle } from '../MeasurementUi.jsx';

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
        showEditButton: true,
        hasDeletableItems: true,
        rlDatum: { id: 'datum-1', position: [0, 0, 0], rlValue: 0 },
      }),
    );
    expect(html).toContain('Distance');
    expect(html).toContain('Height');
    expect(html).toContain('Datum');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="Edit measurements"');
  });

  it('does not render a measurement list inside the HUD when edit mode is active', () => {
    const html = renderToStaticMarkup(
      React.createElement(MeasurementToolsHud, {
        measureKind: 'rl',
        measureSnapMode: 'vertex',
        enableRlOptions: true,
        editMode: true,
        showEditButton: true,
        hasDeletableItems: true,
        rlDatum: { id: 'datum-1', position: [0, 0, 0], rlValue: 0 },
      }),
    );
    expect(html).toContain('aria-label="Done editing measurements"');
    expect(html).not.toContain('aria-label="Delete RL marker"');
    expect(html).not.toContain('aria-label="Delete datum"');
  });

  it('hides the edit button when there is nothing to delete', () => {
    const html = renderToStaticMarkup(
      React.createElement(MeasurementToolsHud, {
        measureKind: 'segment',
        measureSnapMode: 'vertex',
        showEditButton: true,
        hasDeletableItems: false,
      }),
    );
    expect(html).not.toContain('aria-label="Edit measurements"');
  });
});

describe('MeasurementsListPanel', () => {
  const rlDatum = { id: 'datum-1', position: [0, 0, 0], rlValue: 0 };

  it('counts HUD entries including the datum marker', () => {
    expect(countMeasurementHudEntries([], rlDatum)).toBe(1);
    expect(countMeasurementHudEntries([{ id: 'rl-1', kind: 'rl' }, { id: 'rl-2', kind: 'rl' }], rlDatum)).toBe(3);
  });

  it('shows delete all when there are three or more entries', () => {
    const html = renderToStaticMarkup(
      React.createElement(MeasurementsListPanel, {
        measurements: [
          { id: 'rl-1', kind: 'rl', position: [0, 1, 0], measuredFromDatum: true, createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'rl-2', kind: 'rl', position: [0, 2, 0], measuredFromDatum: true, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        units: 'm',
        modelUnits: 'm',
        rlDatum,
        onRemoveMeasurement: () => {},
        onDeleteAllMeasurements: () => {},
      }),
    );
    expect(html).toContain('Delete all');
  });

  it('hides delete all when there are fewer than three entries', () => {
    const html = renderToStaticMarkup(
      React.createElement(MeasurementsListPanel, {
        measurements: [
          { id: 'seg-1', kind: 'segment', distance: 1, start: { position: [0, 0, 0] }, end: { position: [1, 0, 0] }, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        units: 'm',
        modelUnits: 'm',
        rlDatum: null,
        onRemoveMeasurement: () => {},
        onDeleteAllMeasurements: () => {},
      }),
    );
    expect(html).not.toContain('Delete all');
  });
});
