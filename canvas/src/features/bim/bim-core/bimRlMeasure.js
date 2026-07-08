import {
  convertMeasurementDistance,
  normalizeMeasureUnits,
} from '../../threeDArtifact/utils/measureSnap.js';

export const RL_MARKER_COLOR_MODEL = 0x60a5fa;
export const RL_MARKER_COLOR_DATUM_RELATIVE = 0x14b8a6;
export const RL_DATUM_MARKER_COLOR = 0xf59e0b;

function isValidPosition(position) {
  return Array.isArray(position) && position.length === 3
    && position.every((value) => Number.isFinite(value));
}

/**
 * @param {unknown} datum
 * @returns {boolean}
 */
export function isRlDatumLive(datum) {
  return Boolean(datum && isValidPosition(datum.position));
}

/**
 * @param {number[]} position
 * @param {{ datum?: object | null, measuredFromDatum?: boolean }} [options]
 */
export function computeRlFromPosition(position, { datum = null, measuredFromDatum = false } = {}) {
  if (!isValidPosition(position)) return 0;
  const worldY = position[1];
  if (!measuredFromDatum || !isRlDatumLive(datum)) return worldY;
  const datumY = datum.position[1];
  const datumRl = Number.isFinite(datum.rlValue) ? datum.rlValue : 0;
  return datumRl + (worldY - datumY);
}

/**
 * @param {boolean} measuredFromDatum
 * @param {boolean} datumLive
 */
export function getRlMarkerColor(measuredFromDatum, datumLive) {
  if (measuredFromDatum && datumLive) return RL_MARKER_COLOR_DATUM_RELATIVE;
  return RL_MARKER_COLOR_MODEL;
}

/**
 * @param {number} rlValue Stored RL in model world units.
 */
export function formatRlLabel(rlValue, displayUnits = 'm', modelUnits = 'm') {
  const display = normalizeMeasureUnits(displayUnits);
  const model = normalizeMeasureUnits(modelUnits);
  const converted = convertMeasurementDistance(
    Number.isFinite(rlValue) ? rlValue : 0,
    model,
    display,
  );
  return `RL ${converted.toFixed(3)}`;
}

/**
 * @param {number} rlValue
 */
export function formatDatumLabel(rlValue, displayUnits = 'm', modelUnits = 'm') {
  return `DATUM · ${formatRlLabel(rlValue, displayUnits, modelUnits)}`;
}

/**
 * @param {{ position: number[], meshUuid?: string }} snap
 * @param {{ datumLive?: boolean }} [options]
 */
export function createRlMeasurementRecord(snap, { datumLive = false } = {}) {
  if (!snap || !isValidPosition(snap.position)) return null;
  return {
    id: crypto.randomUUID(),
    kind: 'rl',
    snapMode: 'vertex',
    position: snap.position,
    measuredFromDatum: Boolean(datumLive),
    meshUuid: snap.meshUuid,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {{ position: number[], meshUuid?: string }} snap
 * @param {number} [rlValue=0]
 */
export function createRlDatumRecord(snap, rlValue = 0) {
  if (!snap || !isValidPosition(snap.position)) return null;
  return {
    id: crypto.randomUUID(),
    position: snap.position,
    rlValue: Number.isFinite(rlValue) ? rlValue : 0,
    meshUuid: snap.meshUuid,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {unknown} entry
 */
export function normalizeRlMeasurement(entry) {
  if (!entry || entry.kind !== 'rl' || !isValidPosition(entry.position)) return null;
  return {
    id: String(entry.id ?? crypto.randomUUID()),
    kind: 'rl',
    snapMode: 'vertex',
    position: entry.position,
    measuredFromDatum: entry.measuredFromDatum === true,
    meshUuid: entry.meshUuid,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
}

/**
 * @param {unknown} datum
 */
export function normalizeRlDatum(datum) {
  if (!datum || !isValidPosition(datum.position)) return null;
  const rlValue = Number(datum.rlValue);
  return {
    id: String(datum.id ?? crypto.randomUUID()),
    position: datum.position,
    rlValue: Number.isFinite(rlValue) ? rlValue : 0,
    meshUuid: datum.meshUuid,
    createdAt: datum.createdAt ?? new Date().toISOString(),
  };
}

/**
 * @param {Array<object>} measurements
 * @param {object | null} datum
 */
export function formatRlMeasurementLabel(measurement, displayUnits = 'm', modelUnits = 'm', datum = null) {
  const normalized = normalizeRlMeasurement(measurement);
  if (!normalized) return 'RL —';
  const datumLive = isRlDatumLive(datum);
  const rlValue = computeRlFromPosition(normalized.position, {
    datum,
    measuredFromDatum: normalized.measuredFromDatum && datumLive,
  });
  return formatRlLabel(rlValue, displayUnits, modelUnits);
}
