import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BimElementTable } from '../BimElementTable.jsx';
import { BimInspector } from '../BimInspector.jsx';
import { BimQueryPanel } from '../BimQueryPanel.jsx';
import { BimViewport } from '../BimViewport.jsx';

describe('BIM UI components', () => {
  const element = {
    id: 'ifc:wall-1',
    expressId: 42,
    ifcGlobalId: 'wall-1',
    ifcClass: 'IfcWall',
    name: 'North Wall',
    typeName: 'Basic Wall',
    storeyId: 'Level 01',
  };

  it('renders table rows with selected element state', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimElementTable, {
        elements: [element],
        selectedElementId: element.id,
        search: '',
        ifcClassFilter: '',
        onSearchChange: () => {},
        onIfcClassFilterChange: () => {},
        onSelectElement: () => {},
      }),
    );
    expect(html).toContain('North Wall');
    expect(html).toContain('IfcWall');
    expect(html).toContain('wall-1');
    expect(html).toContain('Level 01');
  });

  it('renders inspector identity and grouped properties', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimInspector, {
        element,
        properties: [
          {
            id: 'p1',
            elementId: element.id,
            psetName: 'IFC Attributes',
            propertyName: 'Name',
            value: 'North Wall',
          },
        ],
        provenance: [
          {
            id: 'prov1',
            recordId: element.id,
            extractionRule: 'web-ifc-line',
            sourceFileHash: 'abc',
          },
        ],
        assemblies: [],
        assemblyMembers: [],
      }),
    );
    expect(html).toContain('North Wall');
    expect(html).toContain('IFC Attributes');
    expect(html).toContain('web-ifc-line');
  });

  it('shows viewport loading state before fragments load', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewport, {
        preparedModel: {
          metadata: {
            fragmentsStatus: 'success',
            fragmentsSourceKind: 'fragments',
          },
          fragmentsBlob: new Blob([new Uint8Array([1, 2, 3])]),
          elements: [element],
        },
        selectedElement: null,
        displayMode: 'highlight',
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Loading Fragments model');
  });

  it('shows viewport error when fragments are unavailable', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewport, {
        preparedModel: {
          metadata: {
            fragmentsStatus: 'failed',
            fragmentsSourceKind: 'none',
            fragmentsError: 'bad fragment payload',
          },
          fragmentsBlob: null,
          elements: [element],
        },
        selectedElement: null,
        displayMode: 'highlight',
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Fragments viewport unavailable');
    expect(html).toContain('bad fragment payload');
  });

  it('renders the BQL query controls and result summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimQueryPanel, {
        queryResult: { status: 'success', summary: '3 matching BIM objects', warnings: [] },
        onRunQuery: () => {},
        onClearQuery: () => {},
        onRebuildCache: () => {},
      }),
    );

    expect(html).toContain('3 matching BIM objects');
    expect(html).toContain('BQL query JSON');
  });
});
