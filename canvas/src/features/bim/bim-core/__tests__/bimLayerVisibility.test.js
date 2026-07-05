import { describe, expect, it } from 'vitest';
import {
  buildBimLayerCatalog,
  elementLayerKey,
  elementStoreyKey,
  isElementHiddenByLayerFilter,
  normalizeHiddenLayerState,
  UNASSIGNED_LAYER_LABEL,
  UNASSIGNED_STOREY_LABEL,
} from '../bimLayerVisibility.js';

describe('bimLayerVisibility', () => {
  const preparedModel = {
    elements: [
      { id: 'ifc:1', ifcGlobalId: 'g1', storeyId: 'Level 01' },
      { id: 'ifc:2', ifcGlobalId: 'g2', storeyId: 'Level 02' },
      { id: 'ifc:3', ifcGlobalId: 'g3', storeyId: null },
    ],
    properties: [
      { id: 'p1', elementId: 'ifc:1', propertyName: 'Layer', value: 'Structure' },
      { id: 'p2', elementId: 'ifc:2', propertyName: 'Layer', value: 'Furniture' },
    ],
  };

  it('builds sorted storey and layer catalogs with counts', () => {
    const catalog = buildBimLayerCatalog(preparedModel);
    expect(catalog.storeys).toEqual([
      { id: 'Level 01', label: 'Level 01', count: 1 },
      { id: 'Level 02', label: 'Level 02', count: 1 },
      { id: UNASSIGNED_STOREY_LABEL, label: UNASSIGNED_STOREY_LABEL, count: 1 },
    ]);
    expect(catalog.layers).toEqual([
      { id: 'Furniture', label: 'Furniture', count: 1 },
      { id: 'Structure', label: 'Structure', count: 1 },
      { id: UNASSIGNED_LAYER_LABEL, label: UNASSIGNED_LAYER_LABEL, count: 1 },
    ]);
  });

  it('normalizes hidden layer lists', () => {
    expect(normalizeHiddenLayerState([' Level 01 ', 'Level 01', ''])).toEqual(['Level 01']);
  });

  it('detects hidden elements by storey or layer', () => {
    const element = preparedModel.elements[0];
    const properties = preparedModel.properties.filter((property) => property.elementId === element.id);
    expect(elementStoreyKey(element)).toBe('Level 01');
    expect(elementLayerKey(element, properties)).toBe('Structure');
    expect(isElementHiddenByLayerFilter(element, properties, ['Level 01'], [])).toBe(true);
    expect(isElementHiddenByLayerFilter(element, properties, [], ['Structure'])).toBe(true);
    expect(isElementHiddenByLayerFilter(element, properties, [], [])).toBe(false);
  });
});
