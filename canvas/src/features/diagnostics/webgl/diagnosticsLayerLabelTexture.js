import * as THREE from 'three';

const LABEL_FONT = '600 22px system-ui, -apple-system, Segoe UI, sans-serif';
const TEXTURE_HEIGHT = 48;
const PADDING_X = 6;
const PIXELS_PER_WORLD_UNIT = 200;

export const LAYER_LABEL_WORLD_HEIGHT = 0.14;

/** @type {Map<string, THREE.CanvasTexture>} */
const textureCache = new Map();

/**
 * @param {string} label
 */
export function measureLayerLabelWorldWidth(label) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !label) return 0.6;

  ctx.font = LABEL_FONT;
  const textWidth = ctx.measureText(label.toUpperCase()).width;
  const textureWidth = Math.max(96, Math.ceil(textWidth + PADDING_X * 2));
  return textureWidth / PIXELS_PER_WORLD_UNIT;
}

/**
 * @param {string} label
 */
export function getDiagnosticsLayerLabelTexture(label) {
  const cacheKey = label;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    textureCache.set(cacheKey, fallback);
    return fallback;
  }

  const text = (label || '').toUpperCase();
  ctx.font = LABEL_FONT;
  const textWidth = ctx.measureText(text).width;
  const textureWidth = Math.max(96, Math.ceil(textWidth + PADDING_X * 2));
  canvas.width = textureWidth;
  canvas.height = TEXTURE_HEIGHT;

  ctx.clearRect(0, 0, textureWidth, TEXTURE_HEIGHT);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#71717a';
  ctx.fillText(text, PADDING_X, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function clearDiagnosticsLayerLabelTextureCache() {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
}
