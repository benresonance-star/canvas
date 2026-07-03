import { describe, expect, it } from 'vitest';
import { getEdgeLabelOpacity, getEdgeLabelYOffset, getEmphasizedEdgeLineWidth, getNodeLabelOpacity } from '../DiagnosticsWebGLViewContext.jsx';
import { computeDiagnosticsFitCameraHeight } from '../diagnosticsWebGLCamera.js';

describe('getNodeLabelOpacity', () => {
  const radius = 10;
  const labelViewScale = computeDiagnosticsFitCameraHeight(radius);

  it('returns zero when the camera is far away', () => {
    expect(getNodeLabelOpacity(labelViewScale * 1.5, labelViewScale, false)).toBe(0);
  });

  it('returns full opacity when the camera is close', () => {
    expect(getNodeLabelOpacity(labelViewScale * 0.4, labelViewScale, false)).toBe(1);
  });

  it('fades labels in between reveal and full distance', () => {
    const opacity = getNodeLabelOpacity(labelViewScale * 0.82, labelViewScale, false);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it('reveals emphasized nodes from farther away', () => {
    const distance = labelViewScale * 0.95;
    const emphasized = getNodeLabelOpacity(distance, labelViewScale, true);
    const quiet = getNodeLabelOpacity(distance, labelViewScale, false);
    expect(emphasized).toBeGreaterThan(quiet);
    expect(emphasized).toBeGreaterThan(0);
  });

  it('shows labels at the default fit-camera distance', () => {
    expect(getNodeLabelOpacity(labelViewScale, labelViewScale, false)).toBeGreaterThan(0);
  });
});

describe('getEdgeLabelOpacity', () => {
  const radius = 10;
  const labelViewScale = computeDiagnosticsFitCameraHeight(radius);

  it('hides wire labels sooner than node labels', () => {
    const distance = labelViewScale * 0.9;
    expect(getEdgeLabelOpacity(distance, labelViewScale, false)).toBe(0);
    expect(getNodeLabelOpacity(distance, labelViewScale, false)).toBeGreaterThan(0);
  });

  it('shows emphasized wire labels when zoomed in', () => {
    expect(getEdgeLabelOpacity(labelViewScale * 0.4, labelViewScale, true)).toBe(1);
  });
});

describe('getEdgeLabelYOffset', () => {
  it('lifts emphasized labels above highlighted wires', () => {
    expect(getEdgeLabelYOffset(true)).toBeGreaterThan(getEdgeLabelYOffset(false));
  });
});

describe('getEmphasizedEdgeLineWidth', () => {
  const radius = 10;
  const baseWidth = 3.5;

  it('uses full width when the camera is close', () => {
    expect(getEmphasizedEdgeLineWidth(2, radius, baseWidth)).toBe(baseWidth);
  });

  it('thins lines when the camera is far', () => {
    expect(getEmphasizedEdgeLineWidth(30, radius, baseWidth)).toBeLessThan(baseWidth);
  });

  it('grades width smoothly between near and far distances', () => {
    const mid = getEmphasizedEdgeLineWidth(12, radius, baseWidth);
    expect(mid).toBeGreaterThan(baseWidth * 0.35);
    expect(mid).toBeLessThan(baseWidth);
  });
});
