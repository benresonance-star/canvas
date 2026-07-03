import * as THREE from 'three';
import { DIAGNOSTICS_LAYER_COLORS, FLAT_ROLE_STYLE } from './diagnosticsNodeGlassMaterial.js';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 184;
const PADDING_X = 28;
const PADDING_Y = 22;
const SURFACE_COLOR = '#242428';
const BORDER_BASE = '#3f3f46';

/** @type {Map<string, THREE.CanvasTexture>} */
const textureCache = new Map();

/**
 * @param {{ visualRole?: string, selected?: boolean }} node
 * @returns {'quiet' | 'path' | 'current'}
 */
export function resolveNodeVisualRole(node) {
  if (node.visualRole === 'current' || node.visualRole === 'path') return node.visualRole;
  if (node.selected) return 'current';
  return 'quiet';
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColorsCss(baseHex, tintHex, tintPercent) {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  const ratio = tintPercent / 100;
  const r = Math.round(base.r * (1 - ratio) + tint.r * ratio);
  const g = Math.round(base.g * (1 - ratio) + tint.g * ratio);
  const b = Math.round(base.b * (1 - ratio) + tint.b * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function mixColorsThree(baseHex, tintHex, tintPercent) {
  const css = mixColorsCss(baseHex, tintHex, tintPercent);
  const match = css.match(/rgb\((\d+), (\d+), (\d+)\)/);
  if (!match) return new THREE.Color(baseHex);
  return new THREE.Color(
    Number(match[1]) / 255,
    Number(match[2]) / 255,
    Number(match[3]) / 255,
  );
}

/**
 * @param {keyof typeof DIAGNOSTICS_LAYER_COLORS} layer
 * @param {'quiet' | 'path' | 'current'} role
 */
export function getNodeHighlightStyle(layer, role) {
  const layerColor = DIAGNOSTICS_LAYER_COLORS[layer] ?? DIAGNOSTICS_LAYER_COLORS.external;
  if (role === 'current') {
    return {
      fillColor: mixColorsThree(SURFACE_COLOR, layerColor, 34),
      fillOpacity: 0.92,
      borderColor: mixColorsThree(BORDER_BASE, layerColor, 58),
      borderOpacity: 1,
      borderWidth: 4,
      glowColor: mixColorsThree('#0b0d12', layerColor, 35),
    };
  }
  if (role === 'path') {
    return {
      fillColor: mixColorsThree(SURFACE_COLOR, layerColor, 7),
      fillOpacity: 0.88,
      borderColor: mixColorsThree(BORDER_BASE, layerColor, 28),
      borderOpacity: 0.95,
      borderWidth: 3,
      glowColor: null,
    };
  }
  return {
    fillColor: null,
    fillOpacity: 0,
    borderColor: new THREE.Color(FLAT_ROLE_STYLE.quiet.border),
    borderOpacity: 0.45,
    borderWidth: 2,
    glowColor: null,
  };
}

function truncateLine(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines) {
    lines[maxLines - 1] = truncateLine(ctx, lines[maxLines - 1], maxWidth);
  }

  return lines;
}

/**
 * Text-only texture — cached per node, independent of selection role.
 *
 * @param {object} options
 * @param {string} options.nodeId
 * @param {keyof typeof DIAGNOSTICS_LAYER_COLORS} options.layer
 * @param {string} options.layerLabel
 * @param {string} options.title
 * @param {string} options.purpose
 * @param {boolean} options.ghosted
 */
export function getDiagnosticsNodeLabelTexture({
  nodeId,
  layer,
  layerLabel,
  title,
  purpose,
  ghosted,
}) {
  const cacheKey = `${nodeId}:${ghosted ? 'ghost' : 'solid'}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    textureCache.set(cacheKey, fallback);
    return fallback;
  }

  const layerColor = DIAGNOSTICS_LAYER_COLORS[layer] ?? DIAGNOSTICS_LAYER_COLORS.external;
  const textWidth = TEXTURE_WIDTH - PADDING_X * 2;
  const layerColorMuted = `${layerColor}cc`;

  ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.font = '600 22px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = ghosted ? '#64748b' : layerColorMuted;
  ctx.fillText(layerLabel.toUpperCase(), PADDING_X, PADDING_Y);

  ctx.font = '600 30px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = ghosted ? '#94a3b8' : '#f4f4f5';
  ctx.fillText(truncateLine(ctx, title, textWidth), PADDING_X, PADDING_Y + 30);

  ctx.font = '22px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = ghosted ? '#64748b' : '#a1a1aa';
  wrapLines(ctx, purpose, textWidth, 2).forEach((line, index) => {
    ctx.fillText(line, PADDING_X, PADDING_Y + 72 + index * 28);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function clearDiagnosticsNodeLabelTextureCache() {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
}
