import * as THREE from 'three';

const TEXTURE_HEIGHT = 64;
const PADDING_X = 16;
const PIXELS_PER_WORLD_UNIT = 220;
const LABEL_FONT = '600 24px system-ui, -apple-system, Segoe UI, sans-serif';

export const EDGE_LABEL_WORLD_HEIGHT = 0.2;

const EDGE_LABEL_STYLES = {
  current: { bg: '#2a2218', border: '#f97316', text: '#fafafa' },
  path: { bg: '#182428', border: '#22d3ee', text: '#fafafa' },
  quiet: { bg: '#1f1f24', border: '#71717a', text: '#a1a1aa' },
};

/** @type {Map<string, THREE.CanvasTexture>} */
const textureCache = new Map();

/**
 * @param {string} text
 */
export function measureEdgeLabelWorldWidth(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !text) return 0.5;

  ctx.font = LABEL_FONT;
  const textWidth = ctx.measureText(text).width;
  const textureWidth = Math.max(128, Math.ceil(textWidth + PADDING_X * 2 + 6));
  return textureWidth / PIXELS_PER_WORLD_UNIT;
}

/**
 * @param {string} text
 * @deprecated Use measureEdgeLabelWorldWidth
 */
export function estimateEdgeLabelWorldWidth(text) {
  return measureEdgeLabelWorldWidth(text);
}

/**
 * @param {object} options
 * @param {string} options.edgeId
 * @param {string} options.label
 * @param {'quiet' | 'path' | 'current'} options.role
 * @param {boolean} options.ghosted
 */
export function getDiagnosticsEdgeLabelTexture({
  edgeId,
  label,
  role,
  ghosted,
}) {
  const cacheKey = `${edgeId}:${role}:${ghosted ? 'ghost' : 'solid'}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const style = EDGE_LABEL_STYLES[role] ?? EDGE_LABEL_STYLES.quiet;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    textureCache.set(cacheKey, fallback);
    return fallback;
  }

  ctx.font = LABEL_FONT;
  const textWidth = ctx.measureText(label || '').width;
  const textureWidth = Math.max(128, Math.ceil(textWidth + PADDING_X * 2 + 6));
  canvas.width = textureWidth;
  canvas.height = TEXTURE_HEIGHT;

  const radius = 12;
  const x = 3;
  const y = 3;
  const width = textureWidth - 6;
  const height = TEXTURE_HEIGHT - 6;

  ctx.clearRect(0, 0, textureWidth, TEXTURE_HEIGHT);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = style.bg;
  ctx.globalAlpha = ghosted ? 0.35 : 0.96;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = style.border;
  ctx.lineWidth = role === 'current' ? 2.5 : 2;
  ctx.stroke();

  ctx.font = LABEL_FONT;
  ctx.fillStyle = ghosted ? '#64748b' : style.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, textureWidth / 2, TEXTURE_HEIGHT / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function clearDiagnosticsEdgeLabelTextureCache() {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
}
