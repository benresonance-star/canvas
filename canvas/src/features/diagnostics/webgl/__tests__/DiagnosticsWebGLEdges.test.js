import { describe, expect, it } from 'vitest';
import { FLOW_TO_WORLD_SCALE } from '../../../../lib/architecture/diagnosticsLayout3d.js';
import {
  EDGE_DASH_SIZE,
  EDGE_DASH_SPEED,
  EDGE_GAP_SIZE,
  EDGE_LINE_WIDTH,
  getEdgeLineStyle,
} from '../DiagnosticsWebGLEdges.jsx';

describe('DiagnosticsWebGLEdges styles', () => {
  it('uses thicker Line2 widths for highlighted roles', () => {
    expect(getEdgeLineStyle({ visualRole: 'current', ghosted: false }).lineWidth)
      .toBe(EDGE_LINE_WIDTH.current);
    expect(getEdgeLineStyle({ visualRole: 'path', ghosted: false }).lineWidth)
      .toBe(EDGE_LINE_WIDTH.path);
    expect(EDGE_LINE_WIDTH.current).toBeGreaterThan(EDGE_LINE_WIDTH.path);
    expect(EDGE_LINE_WIDTH.path).toBeGreaterThan(EDGE_LINE_WIDTH.quiet);
  });

  it('renders emphasized path and current edges', () => {
    expect(getEdgeLineStyle({ visualRole: 'path', ghosted: false }).emphasized).toBe(true);
    expect(getEdgeLineStyle({ visualRole: 'current', ghosted: false }).emphasized).toBe(true);
    expect(getEdgeLineStyle({ visualRole: 'quiet', ghosted: false }).emphasized).toBe(false);
  });

  it('animates dashed flowing highlights like the 2D canvas', () => {
    const current = getEdgeLineStyle({ visualRole: 'current', ghosted: false, flowing: true });
    const path = getEdgeLineStyle({
      visualRole: 'path',
      ghosted: false,
      flowing: true,
      flowSpeed: 'slow',
    });
    const quiet = getEdgeLineStyle({ visualRole: 'quiet', ghosted: false, flowing: false });

    expect(current.dashed).toBe(true);
    expect(current.dashSize).toBe(EDGE_DASH_SIZE);
    expect(current.gapSize).toBe(EDGE_GAP_SIZE);
    expect(current.dashSpeed).toBe(EDGE_DASH_SPEED.normal);

    expect(path.dashed).toBe(true);
    expect(path.dashSpeed).toBe(EDGE_DASH_SPEED.slow);

    expect(quiet.dashed).toBe(false);
  });

  it('matches 2D dash animation timing', () => {
    expect(EDGE_DASH_SIZE).toBeCloseTo(5 * FLOW_TO_WORLD_SCALE, 6);
    expect(EDGE_DASH_SPEED.normal).toBeCloseTo((10 / 0.5) * FLOW_TO_WORLD_SCALE, 6);
    expect(EDGE_DASH_SPEED.slow).toBeCloseTo((10 / 1.4) * FLOW_TO_WORLD_SCALE, 6);
  });
});
