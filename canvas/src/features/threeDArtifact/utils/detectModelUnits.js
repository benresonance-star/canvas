import { MEASUREMENT_UNIT_OPTIONS, normalizeMeasureUnits } from './measureSnap.js';

const VALID_UNITS = new Set(MEASUREMENT_UNIT_OPTIONS);

const UNIT_ALIASES = {
  millimeter: 'mm',
  millimeters: 'mm',
  mm: 'mm',
  centimeter: 'cm',
  centimeters: 'cm',
  cm: 'cm',
  meter: 'm',
  meters: 'm',
  m: 'm',
  inch: 'in',
  inches: 'in',
  in: 'in',
  foot: 'ft',
  feet: 'ft',
  ft: 'ft',
};

/**
 * @param {unknown} raw
 * @returns {'mm' | 'cm' | 'm' | 'in' | 'ft' | null}
 */
export function normalizeModelUnitToken(raw) {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  if (VALID_UNITS.has(key)) return key;
  return UNIT_ALIASES[key] ?? null;
}

/**
 * @param {unknown} source
 * @returns {Array<unknown>}
 */
function collectUnitCandidates(source) {
  if (!source || typeof source !== 'object') return [];

  const record = /** @type {Record<string, unknown>} */ (source);
  const extras = record.extras && typeof record.extras === 'object'
    ? /** @type {Record<string, unknown>} */ (record.extras)
    : null;
  const asset = record.asset && typeof record.asset === 'object'
    ? /** @type {Record<string, unknown>} */ (record.asset)
    : null;
  const assetExtras = asset?.extras && typeof asset.extras === 'object'
    ? /** @type {Record<string, unknown>} */ (asset.extras)
    : null;
  const userData = record.userData && typeof record.userData === 'object'
    ? /** @type {Record<string, unknown>} */ (record.userData)
    : null;

  return [
    record.unit,
    record.units,
    record.displayUnit,
    record.worldUnit,
    record.worldUnits,
    extras?.unit,
    extras?.units,
    extras?.displayUnit,
    extras?.worldUnit,
    extras?.worldUnits,
    assetExtras?.unit,
    assetExtras?.units,
    assetExtras?.displayUnit,
    assetExtras?.worldUnit,
    assetExtras?.worldUnits,
    userData?.unit,
    userData?.units,
  ];
}

/**
 * Read world-space units declared in a loaded GLTF (extras, asset metadata, etc.).
 * Falls back to glTF spec default (meters) when the asset is GLTF but undeclared.
 * @param {{ parser?: { json?: unknown }, asset?: unknown, scene?: { userData?: unknown } } | null | undefined} gltf
 * @returns {'mm' | 'cm' | 'm' | 'in' | 'ft' | null}
 */
export function extractModelWorldUnits(gltf) {
  if (!gltf) return null;

  const candidates = [
    ...collectUnitCandidates(gltf.parser?.json),
    ...collectUnitCandidates(gltf.asset),
    ...collectUnitCandidates(gltf.scene),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeModelUnitToken(candidate);
    if (normalized) return normalized;
  }

  if (gltf.parser?.json || gltf.asset) {
    return 'm';
  }

  return null;
}

/**
 * Model world-space unit system (from file metadata or format defaults).
 * @param {{ modelUnits?: string | null } | null | undefined} metadata
 * @param {string | null | undefined} format
 */
export function resolveModelMeasureUnits(metadata, format = null) {
  const modelUnits = normalizeModelUnitToken(metadata?.modelUnits);
  if (modelUnits) return modelUnits;

  const normalizedFormat = String(format ?? '').toLowerCase();
  if (normalizedFormat === 'glb' || normalizedFormat === 'gltf') {
    return 'm';
  }

  return 'cm';
}

/**
 * User-selected display units override model defaults when set.
 * @param {{ modelUnits?: string | null, measureUnits?: string | null, units?: string | null } | null | undefined} metadata
 * @param {string | null | undefined} format
 */
export function resolveDisplayMeasureUnits(metadata, format = null) {
  const userOverride = metadata?.measureUnits ?? metadata?.units;
  if (userOverride) {
    return normalizeMeasureUnits(userOverride);
  }
  return resolveModelMeasureUnits(metadata, format);
}
