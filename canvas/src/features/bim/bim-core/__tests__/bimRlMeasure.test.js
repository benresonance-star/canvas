import { describe, expect, it } from 'vitest';
import {
  computeRlFromPosition,
  createRlDatumRecord,
  createRlMeasurementRecord,
  formatDatumLabel,
  formatRlLabel,
  formatRlMeasurementLabel,
  getRlMarkerColor,
  isRlDatumLive,
  normalizeRlDatum,
  normalizeRlMeasurement,
  RL_DATUM_MARKER_COLOR,
  RL_MARKER_COLOR_DATUM_RELATIVE,
  RL_MARKER_COLOR_MODEL,
} from '../bimRlMeasure.js';

describe('bimRlMeasure', () => {
  const datum = {
    id: 'datum-1',
    position: [0, 10, 0],
    rlValue: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('detects live datum markers', () => {
    expect(isRlDatumLive(datum)).toBe(true);
    expect(isRlDatumLive(null)).toBe(false);
    expect(isRlDatumLive({ position: [0, 'bad', 0] })).toBe(false);
  });

  it('uses raw world Y when datum is absent or not applied', () => {
    expect(computeRlFromPosition([1, 12.36, 2])).toBeCloseTo(12.36, 5);
    expect(computeRlFromPosition([1, 12.36, 2], { datum, measuredFromDatum: false })).toBeCloseTo(12.36, 5);
  });

  it('computes datum-relative RL when measuredFromDatum is true', () => {
    expect(computeRlFromPosition([1, 12.36, 2], { datum, measuredFromDatum: true })).toBeCloseTo(102.36, 5);
    expect(computeRlFromPosition(datum.position, { datum, measuredFromDatum: true })).toBeCloseTo(100, 5);
  });

  it('formats RL labels with three decimal places', () => {
    expect(formatRlLabel(2.36, 'm', 'm')).toBe('RL 2.360');
    expect(formatDatumLabel(0, 'm', 'm')).toBe('DATUM · RL 0.000');
  });

  it('returns marker colours for model elevation and datum-relative markers', () => {
    expect(getRlMarkerColor(false, true)).toBe(RL_MARKER_COLOR_MODEL);
    expect(getRlMarkerColor(true, true)).toBe(RL_MARKER_COLOR_DATUM_RELATIVE);
    expect(getRlMarkerColor(true, false)).toBe(RL_MARKER_COLOR_MODEL);
    expect(RL_DATUM_MARKER_COLOR).toBe(0xf59e0b);
  });

  it('creates and normalizes RL measurement records', () => {
    const record = createRlMeasurementRecord(
      { position: [0, 2.36, 0], meshUuid: 'mesh-1' },
      { datumLive: true },
    );
    expect(record.kind).toBe('rl');
    expect(record.measuredFromDatum).toBe(true);

    const normalized = normalizeRlMeasurement({
      ...record,
      measuredFromDatum: false,
    });
    expect(normalized.measuredFromDatum).toBe(false);
    expect(formatRlMeasurementLabel(normalized, 'm', 'm', datum)).toBe('RL 2.360');
  });

  it('creates and normalizes datum records', () => {
    const record = createRlDatumRecord({ position: [0, 5, 0] }, 12.5);
    expect(record.rlValue).toBe(12.5);
    const normalized = normalizeRlDatum(record);
    expect(normalized.position).toEqual([0, 5, 0]);
    expect(normalized.rlValue).toBe(12.5);
  });
});
