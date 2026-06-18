import { describe, expect, it } from 'vitest';
import {
  computeDragPosition,
  computeResizeRect,
} from '../canvasPointerGeometry.js';

describe('canvasPointerGeometry', () => {
  it('computes final drag position from pointer-up coordinates', () => {
    expect(computeDragPosition({
      startMouseX: 100,
      startMouseY: 120,
      startX: 40,
      startY: 50,
    }, 160, 180, 2)).toEqual({
      x: 70,
      y: 80,
    });
  });

  it('computes final northwest resize rect from pointer-up coordinates', () => {
    expect(computeResizeRect({
      corner: 'nw',
      startMouseX: 100,
      startMouseY: 100,
      startX: 40,
      startY: 50,
      startW: 300,
      startH: 200,
    }, 80, 60, 2)).toEqual({
      x: 30,
      y: 30,
      width: 310,
      height: 220,
    });
  });
});
