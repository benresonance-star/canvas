import * as THREE from 'three';

export const DIAGNOSTICS_LAYER_COLORS = {
  'client-ui': '#818cf8',
  'client-hooks': '#38bdf8',
  'client-sync': '#fbbf24',
  'client-storage': '#34d399',
  api: '#a78bfa',
  postgres: '#f472b6',
  external: '#94a3b8',
};

const SURFACE_MIX = '#1a1a1f';

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColors(baseHex, tintHex, tintPercent) {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  const ratio = tintPercent / 100;
  const r = Math.round(base.r * (1 - ratio) + tint.r * ratio);
  const g = Math.round(base.g * (1 - ratio) + tint.g * ratio);
  const b = Math.round(base.b * (1 - ratio) + tint.b * ratio);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

export const FLAT_ROLE_STYLE = {
  quiet: { opacity: 0.72, border: '#cbd5e1', borderOpacity: 0.45 },
  path: { opacity: 0.88, border: '#22d3ee', borderOpacity: 0.95 },
  current: { opacity: 1, border: '#fb923c', borderOpacity: 1 },
};

/** @type {Map<string, THREE.MeshBasicMaterial>} */
const materialCache = new Map();

/**
 * @param {keyof typeof DIAGNOSTICS_LAYER_COLORS} layer
 * @param {'quiet' | 'path' | 'current'} visualRole
 * @param {boolean} ghosted
 */
export function getDiagnosticsNodeFlatMaterial(layer, visualRole, ghosted = false) {
  const role = visualRole === 'quiet' || visualRole === 'path' || visualRole === 'current'
    ? visualRole
    : 'quiet';
  const cacheKey = `${layer}:${role}:${ghosted ? 'ghost' : 'solid'}`;
  const cached = materialCache.get(cacheKey);
  if (cached) return cached;

  const layerColor = DIAGNOSTICS_LAYER_COLORS[layer] ?? DIAGNOSTICS_LAYER_COLORS.external;
  const fill = mixColors(SURFACE_MIX, layerColor, role === 'current' ? 42 : role === 'path' ? 28 : 18);
  const style = FLAT_ROLE_STYLE[role];

  const material = new THREE.MeshBasicMaterial({
    color: fill,
    transparent: true,
    opacity: ghosted ? 0.14 : style.opacity,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  material.userData = {
    borderColor: new THREE.Color(style.border),
    borderOpacity: ghosted ? 0.2 : style.borderOpacity,
    role,
    ghosted,
  };

  materialCache.set(cacheKey, material);
  return material;
}

/** @type {Map<string, THREE.MeshBasicMaterial>} */
const shelfMaterialCache = new Map();

export function getDiagnosticsLayerShelfMaterial(layer) {
  const cached = shelfMaterialCache.get(layer);
  if (cached) return cached;

  const layerColor = DIAGNOSTICS_LAYER_COLORS[layer] ?? DIAGNOSTICS_LAYER_COLORS.external;
  const fill = mixColors(SURFACE_MIX, layerColor, 8);
  const material = new THREE.MeshBasicMaterial({
    color: fill,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  shelfMaterialCache.set(layer, material);
  return material;
}

export function clearDiagnosticsGlassMaterialCache() {
  materialCache.forEach((material) => material.dispose());
  materialCache.clear();
  shelfMaterialCache.forEach((material) => material.dispose());
  shelfMaterialCache.clear();
}
