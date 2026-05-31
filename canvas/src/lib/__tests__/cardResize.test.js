import { describe, expect, it } from 'vitest';
import {
  CARD_RESIZE_MAX_H,
  CARD_RESIZE_MAX_W,
  CARD_RESIZE_MIN_H,
  CARD_RESIZE_MIN_W,
} from '../constants.js';
import { clampCardSize } from '../cardResize.js';

describe('clampCardSize', () => {
  it('passes through sizes within bounds', () => {
    expect(clampCardSize(400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('clamps below minimum', () => {
    expect(clampCardSize(50, 40)).toEqual({
      width: CARD_RESIZE_MIN_W,
      height: CARD_RESIZE_MIN_H,
    });
  });

  it('clamps above maximum', () => {
    expect(clampCardSize(3000, 2000)).toEqual({
      width: CARD_RESIZE_MAX_W,
      height: CARD_RESIZE_MAX_H,
    });
  });
});
