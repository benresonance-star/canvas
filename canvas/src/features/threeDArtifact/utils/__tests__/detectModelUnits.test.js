import { describe, expect, it } from 'vitest';
import {
  extractModelWorldUnits,
  normalizeModelUnitToken,
  resolveDisplayMeasureUnits,
  resolveModelMeasureUnits,
} from '../detectModelUnits.js';

describe('detectModelUnits', () => {
  it('normalizes common unit tokens', () => {
    expect(normalizeModelUnitToken('Millimeters')).toBe('mm');
    expect(normalizeModelUnitToken('Meters')).toBe('m');
    expect(normalizeModelUnitToken('invalid')).toBeNull();
  });

  it('reads units from glTF asset extras', () => {
    const units = extractModelWorldUnits({
      asset: { version: '2.0' },
      parser: {
        json: {
          asset: {
            extras: { unit: 'millimeters' },
          },
        },
      },
    });
    expect(units).toBe('mm');
  });

  it('defaults glTF assets to meters when undeclared', () => {
    expect(extractModelWorldUnits({
      asset: { version: '2.0' },
      parser: { json: { asset: { version: '2.0' } } },
    })).toBe('m');
  });

  it('prefers user override over model units', () => {
    expect(resolveDisplayMeasureUnits({
      modelUnits: 'mm',
      measureUnits: 'in',
    })).toBe('in');
  });

  it('uses model units when no user override exists', () => {
    expect(resolveDisplayMeasureUnits({ modelUnits: 'mm' })).toBe('mm');
    expect(resolveDisplayMeasureUnits({ units: 'cm' })).toBe('cm');
  });

  it('falls back to glTF meters then cm', () => {
    expect(resolveDisplayMeasureUnits({}, 'glb')).toBe('m');
    expect(resolveDisplayMeasureUnits({}, 'obj')).toBe('cm');
  });

  it('resolves model measure units separately from display override', () => {
    expect(resolveModelMeasureUnits({ modelUnits: 'mm' }, 'glb')).toBe('mm');
    expect(resolveModelMeasureUnits({}, 'glb')).toBe('m');
  });
});
