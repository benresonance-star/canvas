import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BimSelectedElementHud } from '../BimSelectedElementHud.jsx';
import { BimElementTable } from '../BimElementTable.jsx';
import { BimInspector } from '../BimInspector.jsx';
import { BimAgentResponsePanel, BimQueryPanel } from '../BimQueryPanel.jsx';
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

  it('shows expanded selected HUD when inspector is collapsed', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimSelectedElementHud, {
        element,
        properties: [
          {
            id: 'p-layer',
            elementId: element.id,
            psetName: 'Archicad Properties',
            propertyName: 'Layer',
            value: 'Structure',
          },
        ],
        inspectorOpen: false,
      }),
    );
    expect(html).toContain('Type');
    expect(html).toContain('Basic Wall');
    expect(html).toContain('Layer');
    expect(html).toContain('Structure');
    expect(html).toContain('Element ID');
    expect(html).toContain('ifc:wall-1');
    expect(html).toContain('Global ID');
    expect(html).toContain('wall-1');
    expect(html).toContain('pointer-events-none');
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

  it('renders perspective FOV input and projection toggle in the viewport toolbar', () => {
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
        projectionMode: 'perspective',
        initialCamera: { position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 60 },
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Field of view (degrees)');
    expect(html).toContain('Switch to isometric (orthographic)');
    expect(html).toContain('value="60"');
  });

  it('hides FOV input in orthographic projection mode', () => {
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
        projectionMode: 'orthographic',
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).not.toContain('Field of view (degrees)');
    expect(html).toContain('Switch to perspective');
  });

  it('renders measurement toolbar controls in the BIM viewport', () => {
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
        measureUnits: 'm',
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Measure');
    expect(html).toContain('Measurement unit');
    expect(html).toContain('value="m"');
  });

  it('renders the HDRI lighting toggle in the BIM viewport', () => {
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
        showEnvironment: false,
        environmentPreset: 'studio',
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Lighting: off');
  });

  it('renders the wireframe toggle in the BIM viewport', () => {
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
        wireframeMode: true,
        onDisplayModeChange: () => {},
        onWireframeModeChange: () => {},
      }),
    );
    expect(html).toContain('Wireframe overlay (visible edges)');
    expect(html).toContain('Wireframe style controls');
    expect(html).toContain('Wireframe line weight');
    expect(html).toContain('Wireframe transparency');
    expect(html).toContain('Wireframe colour');
  });

  it('hides wireframe style controls when wireframe mode is off', () => {
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
        wireframeMode: false,
        onDisplayModeChange: () => {},
        onWireframeModeChange: () => {},
      }),
    );
    expect(html).not.toContain('Wireframe style controls');
  });

  it('renders the BQL query controls and result summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimQueryPanel, {
        queryResult: {
          status: 'success',
          summary: '3 matching BIM objects',
          select: 'count',
          warnings: [],
          objectRefs: [{ id: 'ifc:1' }, { id: 'ifc:2' }, { id: 'ifc:3' }],
        },
        agentRunState: {
          status: 'ready',
          message: 'Provider unavailable; answered with local BIM rules.',
          model: 'local/bim-bql-rules-v0.1',
          responderLabel: 'Local BIM rules',
        },
        onRunQuery: () => {},
        onClearQuery: () => {},
        onRebuildCache: () => {},
        savedQueries: [{
          id: 'saved-1',
          label: 'Saved walls',
          query: { version: '0.1', select: 'elements', where: { ifcClass: 'IfcWall' } },
        }],
      }),
    );

    expect(html).toContain('BQL query JSON');
    expect(html).toContain('BIM Evidence Agent');
    expect(html).toContain('local/bim-bql-rules-v0.1');
    expect(html).toContain('Local BIM Rules');
    expect(html).toContain('ChatGPT');
    expect(html).toContain('Mode: Local BIM Rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Responder: Local BIM rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Provider status: ready');
    expect(html).toContain('Ask selected BIM responder');
    expect(html).not.toContain('Ask provider BIM agent');
    expect(html).toContain('prepared IFC index');
    expect(html).toContain('Color by storey');
    expect(html).toContain('Saved walls');
  });

  it('renders the agent response panel with generated BQL', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          question: 'How many slabs are on ground floor?',
          answer: '12 slabs on ground floor found.',
          selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'ready',
          providerStatus: 'ready',
          providerStatusMessage: 'Local BIM Rules ready.',
          didProviderRun: false,
          workSummary: 'Local rules drafted BQL',
          warnings: [],
          query: {
            version: '0.1',
            select: 'count',
            where: {
              and: [
                { ifcClass: 'IfcSlab' },
                { storey: 'ground floor' },
              ],
            },
          },
          resultSummary: '12 matching BIM objects',
          evidenceSummary: '12 slabs on ground floor; 12 evidence records.',
        },
      }),
    );

    expect(html).toContain('Agent Response');
    expect(html).toContain('12 slabs on ground floor found.');
    expect(html).toContain('Selected mode:');
    expect(html).toContain('Responder:');
    expect(html).toContain('Provider status:');
    expect(html).toContain('Local BIM Rules ready.');
    expect(html).toContain('Local BIM Rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Work:');
    expect(html).toContain('Local rules drafted BQL');
    expect(html).toContain('Evidence:');
    expect(html).toContain('Generated BQL');
  });

  it('renders grouped agent response breakdowns', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          question: 'Count slabs by storey',
          answer: '3 slabs grouped by storey: GROUND FLOOR: 2, ROOF: 1.',
          selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'ready',
          workSummary: 'Local rules drafted BQL',
          query: {
            version: '0.1',
            select: 'groupedCount',
            groupBy: 'storey',
            where: { ifcClass: 'IfcSlab' },
          },
          result: {
            select: 'groupedCount',
            groups: [
              { value: 'GROUND FLOOR', count: 2 },
              { value: 'ROOF', count: 1 },
            ],
          },
          evidenceSummary: '3 slabs in 2 storey groups.',
        },
      }),
    );

    expect(html).toContain('3 slabs grouped by storey');
    expect(html).toContain('GROUND FLOOR');
    expect(html).toContain('ROOF');
  });

  it('renders semantic resolution details in the agent response panel', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          answer: '1 top rail found.',
          selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'ready',
          workSummary: 'Local rules drafted BQL; Local rules resolved aliases',
          semanticResolution: {
            terms: ['top rail'],
            aliases: ['toprail', 'TOPRAIL - 001'],
            source: 'vocabulary',
          },
        },
      }),
    );

    expect(html).toContain('Resolution:');
    expect(html).toContain('BIM vocabulary');
    expect(html).toContain('TOPRAIL - 001');
  });

  it('renders provider fallback visibly in the agent response panel', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          answer: '138 slabs found.',
          selectedResponder: 'Gemma 26B Local/gemma4:26b',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'fallback',
          providerStatus: 'apiOffline',
          providerStatusMessage: 'Canvas API offline. Start with npm run dev:stack or npm run server.',
          didProviderRun: false,
          fallbackUsed: true,
          workSummary: 'Provider failed; local rules answered',
          warnings: ['Cannot reach the Canvas API.'],
          evidenceSummary: '138 slabs; 138 evidence records.',
        },
      }),
    );

    expect(html).toContain('Fallback used');
    expect(html).toContain('Provider failed; local rules answered');
    expect(html).toContain('Local BIM Rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Canvas API offline. Start with npm run dev:stack or npm run server.');
    expect(html).toContain('Cannot reach the Canvas API.');
  });

  it('renders stale-ready API failures as provider did not run', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          answer: '138 slabs found.',
          selectedResponder: 'Gemma 26B Local/gemma4:26b',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'fallback',
          providerStatus: 'apiOffline',
          providerStatusMessage: 'Canvas API offline. Start with npm run dev:stack or npm run server.',
          didProviderRun: false,
          fallbackUsed: true,
          workSummary: 'Provider did not run; local rules answered',
          warnings: ['Cannot reach the Canvas API. Is npm run server running?'],
          evidenceSummary: '138 slabs; 138 evidence records.',
        },
      }),
    );

    expect(html).toContain('Fallback used');
    expect(html).toContain('Provider did not run; local rules answered');
    expect(html).toContain('Canvas API offline. Start with npm run dev:stack or npm run server.');
    expect(html).not.toContain('Provider failed after the request started.');
  });

  it('renders invalid provider BQL as local-rule fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          answer: '138 slabs on roof found.',
          selectedResponder: 'Gemma 26B Local/gemma4:26b',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'fallback',
          providerStatus: 'invalidBql',
          providerStatusMessage: 'Gemma 26B Local drafted invalid BQL; local rules answered.',
          didProviderRun: true,
          fallbackUsed: true,
          workSummary: 'Provider drafted invalid BQL; local rules answered',
          warnings: ['select: Unsupported select value'],
          evidenceSummary: '138 slabs on roof; 138 evidence records.',
        },
      }),
    );

    expect(html).toContain('Fallback used');
    expect(html).toContain('Provider drafted invalid BQL; local rules answered');
    expect(html).toContain('Gemma 26B Local drafted invalid BQL; local rules answered.');
    expect(html).toContain('select: Unsupported select value');
  });

  it('shows provider did not run state when a selected provider is API offline', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimQueryPanel, {
        queryResult: null,
        onRunQuery: () => {},
        onClearQuery: () => {},
        onRebuildCache: () => {},
        initialResponderId: 'ollama-gemma-26b',
        agentProviderState: {
          status: 'offline',
          message: 'Canvas API offline. Start with npm run dev:stack or npm run server.',
          connectors: [],
        },
      }),
    );

    expect(html).toContain('Mode: Gemma 26B Local/gemma4:26b');
    expect(html).toContain('Provider status: API offline');
    expect(html).toContain('Canvas API offline. Start with npm run dev:stack or npm run server.');
  });

  it('shows model missing readiness for unpulled Gemma', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimQueryPanel, {
        queryResult: null,
        onRunQuery: () => {},
        onClearQuery: () => {},
        onRebuildCache: () => {},
        initialResponderId: 'ollama-gemma-26b',
        agentProviderState: {
          status: 'ready',
          message: 'Canvas API ready.',
          connectors: [{
            id: 'ollama-gemma-26b',
            label: 'Gemma 26B Local',
            provider: 'ollama',
            model: 'gemma4:26b',
            configured: true,
            usable: false,
            needsPull: true,
            healthError: 'Ollama is running, but gemma4:26b is not pulled.',
          }],
        },
      }),
    );

    expect(html).toContain('Provider status: model not pulled');
    expect(html).toContain('gemma4:26b not pulled. Pull the model before asking Gemma 26B Local.');
  });
});
