import { describe, expect, it, vi } from 'vitest';
import {
  applyColorByHighlight,
  BIM_COLOR_BY_DEFAULT_PROPERTY,
  BIM_COLOR_BY_PALETTE,
  buildColorByHighlightMaterial,
  groupElementsByColorKey,
  resolveColorByGroupKey,
  resolveColorByPaletteColor,
  resolveElementColorByPaletteColor,
  resolveStablePaletteIndex,
} from '../bimColorBy.js';

describe('bimColorBy', () => {
  const slab = { id: 'e1', ifcGlobalId: 'slab-guid', ifcClass: 'IfcSlab', name: 'Slab 1' };
  const beam = { id: 'e2', ifcGlobalId: 'beam-guid', ifcClass: 'IfcBeam', name: 'Beam 1' };
  const wall = { id: 'e3', ifcGlobalId: 'wall-guid', ifcClass: 'IfcWall', storeyId: 'storey-1' };

  it('resolves ifcClass group keys by default', () => {
    expect(resolveColorByGroupKey(slab, BIM_COLOR_BY_DEFAULT_PROPERTY)).toBe('IfcSlab');
    expect(resolveColorByGroupKey(beam, 'class')).toBe('IfcBeam');
  });

  it('resolves storey and name group keys', () => {
    expect(resolveColorByGroupKey(wall, 'storey')).toBe('storey-1');
    expect(resolveColorByGroupKey(slab, 'name')).toBe('Slab 1');
  });

  it('groups elements by color key', () => {
    const groups = groupElementsByColorKey([slab, beam, { ...slab, id: 'e4', ifcGlobalId: 'slab-2' }], 'ifcClass');
    expect(groups.get('IfcSlab')).toHaveLength(2);
    expect(groups.get('IfcBeam')).toHaveLength(1);
  });

  it('returns stable palette indices for the same group key', () => {
    const first = resolveStablePaletteIndex('IfcSlab');
    const second = resolveStablePaletteIndex('IfcSlab');
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(BIM_COLOR_BY_PALETTE.length);
  });

  it('resolves the same palette color for elements and viewport highlights', () => {
    expect(resolveElementColorByPaletteColor(slab, 'ifcClass')).toBe(resolveColorByPaletteColor('IfcSlab'));
    expect(resolveElementColorByPaletteColor(beam, 'ifcClass')).toBe(resolveColorByPaletteColor('IfcBeam'));
  });

  it('builds highlight materials with deterministic palette colors', () => {
    const material = buildColorByHighlightMaterial('IfcBeam', resolveStablePaletteIndex('IfcBeam'));
    expect(material.customId).toContain('IfcBeam');
    expect(material.opacity).toBe(0.92);
    expect(material.transparent).toBe(true);
  });

  it('applies grouped highlights to fragment local ids', async () => {
    const highlight = vi.fn(async () => {});
    const model = {
      getLocalIdsByGuids: vi.fn(async (guids) => guids.map((guid) => {
        if (guid === 'slab-guid') return 1;
        if (guid === 'beam-guid') return 2;
        return null;
      })),
      highlight,
    };

    const result = await applyColorByHighlight(model, null, null, {
      elements: [slab, beam],
      property: 'ifcClass',
    });

    expect(result.groupCount).toBe(2);
    expect(result.localIdCount).toBe(2);
    expect(highlight).toHaveBeenCalledTimes(2);
  });
});
