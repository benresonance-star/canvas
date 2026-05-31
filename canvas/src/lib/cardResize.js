import {
  CARD_RESIZE_MAX_H,
  CARD_RESIZE_MAX_W,
  CARD_RESIZE_MIN_H,
  CARD_RESIZE_MIN_W,
} from './constants.js';

export function clampCardSize(width, height) {
  return {
    width: Math.min(CARD_RESIZE_MAX_W, Math.max(CARD_RESIZE_MIN_W, width)),
    height: Math.min(CARD_RESIZE_MAX_H, Math.max(CARD_RESIZE_MIN_H, height)),
  };
}
