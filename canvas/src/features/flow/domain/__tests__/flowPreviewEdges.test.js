import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import {
  buildFlowPreviewEdgePath,
  flowPreviewEdgePositions,
  flowPreviewNodeAnchor,
} from '../flowPreviewEdges.js';

describe('flowPreviewEdges', () => {
  const source = { x: 0, y: 40, width: 180, height: 80 };
  const target = { x: 260, y: 10, width: 180, height: 80 };

  it('flowPreviewEdgePositions prefers horizontal routing left to right', () => {
    expect(flowPreviewEdgePositions(source, target)).toEqual({
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  it('flowPreviewNodeAnchor returns border midpoints', () => {
    expect(flowPreviewNodeAnchor(source, Position.Right)).toEqual({ x: 180, y: 80 });
    expect(flowPreviewNodeAnchor(target, Position.Left)).toEqual({ x: 260, y: 50 });
  });

  it('buildFlowPreviewEdgePath returns a stepped path, not a single diagonal', () => {
    const path = buildFlowPreviewEdgePath(source, target);
    expect(path.startsWith('M')).toBe(true);
    expect(path).toContain('L');
    expect(path.split('L').length).toBeGreaterThan(2);
    expect(path).not.toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
  });
});
