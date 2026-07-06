import { describe, expect, it } from 'vitest';
import {
  filterInspectorIdentityFields,
  filterInspectorMemberships,
  filterInspectorPropertyGroups,
  filterInspectorProvenance,
  inspectorHasVisibleContent,
} from '../bimInspectorSearch.js';

const element = {
  typeName: 'Basic Wall',
  storeyId: 'GROUND FLOOR',
  expressId: 36125,
};

describe('bimInspectorSearch', () => {
  it('returns all identity rows when search is empty', () => {
    expect(filterInspectorIdentityFields(element, '')).toHaveLength(3);
  });

  it('filters identity rows by label or value', () => {
    expect(filterInspectorIdentityFields(element, 'storey')).toEqual([
      { label: 'Storey', value: 'GROUND FLOOR' },
    ]);
    expect(filterInspectorIdentityFields(element, '36125')).toEqual([
      { label: 'Express ID', value: 36125 },
    ]);
  });

  it('filters grouped properties by group, name, or value', () => {
    const grouped = [
      ['IFC Attributes', [
        { id: 'p1', propertyName: 'Name', value: '2mm PLATE' },
        { id: 'p2', propertyName: 'Layer', value: 'Structure' },
      ]],
      ['Archicad Properties', [
        { id: 'p3', propertyName: 'Fire Rating', value: '2HR' },
      ]],
    ];

    expect(filterInspectorPropertyGroups(grouped, 'plate')).toEqual([
      ['IFC Attributes', [{ id: 'p1', propertyName: 'Name', value: '2mm PLATE' }]],
    ]);
    expect(filterInspectorPropertyGroups(grouped, 'archicad')).toEqual([
      ['Archicad Properties', [{ id: 'p3', propertyName: 'Fire Rating', value: '2HR' }]],
    ]);
  });

  it('filters provenance and assembly memberships', () => {
    expect(filterInspectorProvenance([
      { id: 'p1', extractionRule: 'web-ifc-line', sourceFileHash: 'abc123' },
    ], 'web-ifc')).toHaveLength(1);
    expect(filterInspectorProvenance([
      { id: 'p1', extractionRule: 'web-ifc-line', sourceFileHash: 'abc123' },
    ], 'missing')).toHaveLength(0);

    expect(filterInspectorMemberships([
      {
        assemblyId: 'a1',
        elementId: 'e1',
        memberRole: 'primary',
        assembly: { id: 'assembly-1', kind: 'wall-run' },
      },
    ], 'wall-run')).toHaveLength(1);
    expect(filterInspectorMemberships([
      {
        assemblyId: 'a1',
        elementId: 'e1',
        memberRole: 'primary',
        assembly: { id: 'assembly-1', kind: 'wall-run' },
      },
    ], 'primary')).toHaveLength(1);
  });

  it('reports when filtered inspector content is empty', () => {
    expect(inspectorHasVisibleContent({
      identityRows: [],
      propertyGroups: [],
      provenance: [],
      memberships: [],
    })).toBe(false);
    expect(inspectorHasVisibleContent({
      identityRows: [{ label: 'Type', value: 'Basic Wall' }],
      propertyGroups: [],
      provenance: [],
      memberships: [],
    })).toBe(true);
  });
});
