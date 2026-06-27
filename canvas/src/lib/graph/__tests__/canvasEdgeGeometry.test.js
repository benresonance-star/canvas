import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import {
  cardLinkBounds,
  edgeMidpoint,
  edgePath,
  resolveCardEdgeAnchors,
  resolveLinkDragAnchors,
} from '../canvasEdgeGeometry.js';

describe('resolveCardEdgeAnchors', () => {
  const source = {
    left: 0,
    top: 0,
    right: 200,
    bottom: 120,
    centerX: 100,
    centerY: 60,
  };

  it('uses right-to-left anchors when the target is to the right', () => {
    const target = {
      left: 300,
      top: 20,
      right: 500,
      bottom: 140,
      centerX: 400,
      centerY: 80,
    };

    expect(resolveCardEdgeAnchors(source, target)).toEqual({
      fromX: 200,
      fromY: 60,
      toX: 300,
      toY: 80,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  it('uses left-to-right anchors when the target is to the left', () => {
    const target = {
      left: -220,
      top: 10,
      right: -20,
      bottom: 130,
      centerX: -120,
      centerY: 70,
    };

    expect(resolveCardEdgeAnchors(source, target)).toEqual({
      fromX: 0,
      fromY: 60,
      toX: -20,
      toY: 70,
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
    });
  });

  it('uses bottom-to-top anchors when the target is below', () => {
    const target = {
      left: 60,
      top: 220,
      right: 140,
      bottom: 300,
      centerX: 100,
      centerY: 260,
    };

    expect(resolveCardEdgeAnchors(source, target)).toEqual({
      fromX: 100,
      fromY: 120,
      toX: 100,
      toY: 220,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });
});

describe('edgePath', () => {
  it('returns a horizontal-entry bezier path', () => {
    const path = edgePath(200, 60, 300, 80, Position.Right, Position.Left);
    expect(path).toMatch(/^M ?200,?60 C/);
    expect(path).toContain('300,80');
  });

  it('places the midpoint on the curve', () => {
    const mid = edgeMidpoint(200, 60, 300, 80, Position.Right, Position.Left);
    expect(mid.x).toBeGreaterThan(200);
    expect(mid.x).toBeLessThan(300);
    expect(mid.y).toBeGreaterThan(50);
    expect(mid.y).toBeLessThan(90);
  });
});

describe('resolveLinkDragAnchors', () => {
  const source = cardLinkBounds({ x: 0, y: 0, width: 200, height: 120 });

  it('keeps the source on the right edge and snaps the target edge when hovering', () => {
    const target = cardLinkBounds({ x: 300, y: 20, width: 200, height: 120 });
    const anchors = resolveLinkDragAnchors(source, target, { x: 999, y: 999 });

    expect(anchors.fromX).toBe(source.right);
    expect(anchors.fromY).toBe(source.centerY);
    expect(anchors.toX).toBe(target.left);
    expect(anchors.toY).toBe(target.centerY);
    expect(anchors.sourcePosition).toBe(Position.Right);
    expect(anchors.targetPosition).toBe(Position.Left);
  });
});
