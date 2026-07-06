import { describe, expect, it } from 'vitest';
import {
  addTableColumn,
  buildTableColumnCatalog,
  DEFAULT_TABLE_COLUMNS,
  normalizeTableColumns,
  normalizeTableSort,
  removeTableColumn,
  reorderTableColumns,
  resizeTableColumns,
  resolveTableColumnValue,
  sortTableElements,
  tableColumnGridTemplate,
  updateTableColumnField,
} from '../bimTableColumns.js';

describe('bimTableColumns', () => {
  const element = {
    id: 'ifc:wall-1',
    expressId: 42,
    ifcGlobalId: 'wall-1',
    ifcClass: 'IfcWall',
    name: 'North Wall',
    typeName: 'Basic Wall',
    storeyId: 'Level 01',
  };
  const properties = [
    {
      id: 'p1',
      elementId: 'ifc:wall-1',
      psetName: 'Archicad Properties',
      propertyName: 'Layer',
      value: 'Structure',
    },
    {
      id: 'p2',
      elementId: 'ifc:wall-1',
      psetName: 'Pset_WallCommon',
      propertyName: 'FireRating',
      value: '60 min',
    },
  ];

  it('normalizes default columns when state is missing', () => {
    expect(normalizeTableColumns(undefined)).toEqual(DEFAULT_TABLE_COLUMNS);
  });

  it('builds a catalog from projected properties and built-in fields', () => {
    const catalog = buildTableColumnCatalog(properties);
    expect(catalog.some((entry) => entry.field === 'element:name')).toBe(true);
    expect(catalog.some((entry) => entry.field === 'property:Archicad Properties.Layer')).toBe(true);
    expect(catalog.some((entry) => entry.field === 'property:Pset_WallCommon.FireRating')).toBe(true);
  });

  it('resolves built-in and property column values', () => {
    const columns = normalizeTableColumns([
      { id: 'name', field: 'element:name' },
      { id: 'layer', field: 'property:Archicad Properties.Layer' },
      { id: 'fire', field: 'property:Pset_WallCommon.FireRating' },
    ]);
    expect(resolveTableColumnValue(element, properties, columns[0])).toBe('North Wall');
    expect(resolveTableColumnValue(element, properties, columns[1])).toBe('Structure');
    expect(resolveTableColumnValue(element, properties, columns[2])).toBe('60 min');
  });

  it('sorts table elements by column values ascending and descending', () => {
    const columns = normalizeTableColumns([
      { id: 'name', field: 'element:name' },
      { id: 'storey', field: 'element:storeyId' },
    ]);
    const elements = [
      { id: 'ifc:1', name: 'Charlie', storeyId: 'ROOF' },
      { id: 'ifc:2', name: 'Alpha', storeyId: 'GROUND FLOOR' },
      { id: 'ifc:3', name: 'Bravo', storeyId: 'LEVEL 1' },
    ];
    const propertiesByElement = new Map();

    const ascending = sortTableElements(elements, columns, propertiesByElement, {
      columnId: 'name',
      direction: 'asc',
    });
    expect(ascending.map((element) => element.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const descending = sortTableElements(elements, columns, propertiesByElement, {
      columnId: 'storey',
      direction: 'desc',
    });
    expect(descending.map((element) => element.storeyId)).toEqual(['ROOF', 'LEVEL 1', 'GROUND FLOOR']);

    expect(sortTableElements(elements, columns, propertiesByElement, { columnId: null, direction: null }))
      .toEqual(elements);
    expect(normalizeTableSort({ columnId: 'missing', direction: 'asc' }, columns)).toEqual({
      columnId: null,
      direction: null,
    });
  });

  it('reorders, updates, adds, removes, and resizes columns', () => {
    const initial = normalizeTableColumns();
    const reordered = reorderTableColumns(initial, 'storey', 'name');
    expect(reordered.map((column) => column.id)).toEqual(['storey', 'name', 'class', 'globalId', 'type']);

    const updated = updateTableColumnField(initial, 'type', 'property:Pset_WallCommon.FireRating');
    expect(updated.find((column) => column.id === 'type')?.field).toBe('property:Pset_WallCommon.FireRating');

    const added = addTableColumn(initial, 'property:Archicad Properties.Layer');
    expect(added).toHaveLength(6);
    expect(added.at(-1)?.width).toBe(1);

    const removed = removeTableColumn(initial, 'type');
    expect(removed).toHaveLength(4);
    expect(removeTableColumn([{ id: 'only', field: 'element:name' }], 'only')).toHaveLength(1);

    const resized = resizeTableColumns(initial, 0, 0.2);
    expect(resized[0].width).toBeGreaterThan(initial[0].width);
    expect(resized[1].width).toBeLessThan(initial[1].width);
    expect(tableColumnGridTemplate(initial)).toContain('minmax(3rem,');
  });
});
