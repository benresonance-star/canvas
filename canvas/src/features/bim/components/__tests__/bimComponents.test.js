import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BimSelectedElementHud } from '../BimSelectedElementHud.jsx';
import { BimElementTable } from '../BimElementTable.jsx';
import { DEFAULT_TABLE_COLUMNS } from '../../bim-core/bimTableColumns.js';
import { BimInspector } from '../BimInspector.jsx';
import { BimAgentResponsePanel, BimQueryPanel } from '../BimQueryPanel.jsx';
import { BimViewport } from '../BimViewport.jsx';
import { BimStyleSettingsHud } from '../BimStyleSettingsHud.jsx';
import { BimAgentHud } from '../BimAgentHud.jsx';
import { BimBqlHud } from '../BimBqlHud.jsx';
import { BimLayersHud } from '../BimLayersHud.jsx';
import { BimSectionHud } from '../BimSectionHud.jsx';
import { BimSunStudyHud } from '../BimSunStudyHud.jsx';
import { Bim4dHud } from '../Bim4dHud.jsx';
import { Bim5dHud } from '../Bim5dHud.jsx';
import { BimViewCarousel } from '../BimViewCarousel.jsx';
import { BIM_AGENT_INFO } from '../bimAgentPanelShared.js';
import { createBimViewFromWorkspaceState, createBimViewSet } from '../../bim-core/bimViewSets.js';

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
        properties: [],
        selectedElementId: element.id,
        search: '',
        ifcClassFilter: '',
        columns: DEFAULT_TABLE_COLUMNS,
        tableSort: { columnId: null, direction: null },
        onSearchChange: () => {},
        onIfcClassFilterChange: () => {},
        onColumnsChange: () => {},
        onTableSortChange: () => {},
        onSelectElement: () => {},
      }),
    );
    expect(html).toContain('North Wall');
    expect(html).toContain('IfcWall');
    expect(html).toContain('wall-1');
    expect(html).toContain('Level 01');
    expect(html).toContain('Columns');
  });

  it('hides geo sun path controls in manual mode', () => {
    const manualHtml = renderToStaticMarkup(
      React.createElement(BimSunStudyHud, {
        environmentalAnalysis: {
          sunStudy: {
            enabled: true,
            controlMode: 'manual',
            showSunPath: true,
          },
        },
        onEnvironmentalAnalysisChange: () => {},
      }),
    );
    expect(manualHtml).not.toContain('Path');
    expect(manualHtml).not.toContain('Compass');
    expect(manualHtml).not.toContain('Radius');
    expect(manualHtml).not.toContain('Daylight saving');

    const geoHtml = renderToStaticMarkup(
      React.createElement(BimSunStudyHud, {
        environmentalAnalysis: {
          sunStudy: {
            enabled: true,
            controlMode: 'geo',
            showSunPath: true,
          },
        },
        onEnvironmentalAnalysisChange: () => {},
      }),
    );
    expect(geoHtml).toContain('Path');
    expect(geoHtml).toContain('Compass');
    expect(geoHtml).toContain('Radius');
    expect(geoHtml).toContain('Daylight saving');
    expect(geoHtml).toContain('Brightness');
    expect(geoHtml).toContain('Shadow colour');
  });

  it('locks sun study lat/lon fields for the Melbourne timezone preset', () => {
    const melbourneHtml = renderToStaticMarkup(
      React.createElement(BimSunStudyHud, {
        environmentalAnalysis: {
          site: {
            timezone: 'Australia/Melbourne',
            latitude: 12,
            longitude: 34,
          },
          sunStudy: {
            enabled: true,
            controlMode: 'geo',
          },
        },
        onEnvironmentalAnalysisChange: () => {},
      }),
    );
    const customHtml = renderToStaticMarkup(
      React.createElement(BimSunStudyHud, {
        environmentalAnalysis: {
          site: {
            timezone: 'Custom',
            presetId: 'custom',
            latitude: 12,
            longitude: 34,
            customPresets: [
              {
                id: 'custom-office-roof',
                label: 'Office roof',
                latitude: -33.7,
                longitude: 151.1,
                timezone: 'Australia/Sydney',
                daylightSavingTime: true,
              },
            ],
          },
          sunStudy: {
            enabled: true,
            controlMode: 'geo',
          },
        },
        onEnvironmentalAnalysisChange: () => {},
      }),
    );

    expect(melbourneHtml).toMatch(/<input[^>]*disabled=""[^>]*aria-label="Lat"/);
    expect(melbourneHtml).toMatch(/<input[^>]*disabled=""[^>]*aria-label="Lon"/);
    expect(melbourneHtml).toContain('value="-37.8136"');
    expect(melbourneHtml).toContain('value="144.9631"');
    expect(melbourneHtml).toContain('Sydney');
    expect(melbourneHtml).toContain('Brisbane');
    expect(melbourneHtml).toContain('Hobart');
    expect(melbourneHtml).toContain('Adelaide');
    expect(melbourneHtml).toContain('Perth');
    expect(melbourneHtml).toContain('Canberra');
    expect(melbourneHtml).toContain('Darwin');
    expect(melbourneHtml).toContain('London');
    expect(melbourneHtml).toContain('New York');
    expect(melbourneHtml).toContain('Paris');
    expect(melbourneHtml).toContain('Shanghai');
    expect(melbourneHtml).toContain('Mumbai');
    expect(melbourneHtml).toContain('Singapore');
    expect(melbourneHtml).toContain('Custom');
    expect(customHtml).toMatch(/<input(?![^>]*disabled="")[^>]*aria-label="Lat"/);
    expect(customHtml).toMatch(/<input(?![^>]*disabled="")[^>]*aria-label="Lon"/);
    expect(customHtml).toContain('value="12"');
    expect(customHtml).toContain('value="34"');
    expect(customHtml).toContain('Office roof');
    expect(customHtml).toContain('Preset name');
    expect(customHtml).toContain('Save');
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
        search: '',
        onSearchChange: () => {},
      }),
    );
    expect(html).toContain('Search attributes');
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
    expect(html).toContain('Preparing viewer');
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

  it('renders 4D sequencing controls with saved result sets and tasks', () => {
    const html = renderToStaticMarkup(
      React.createElement(Bim4dHud, {
        sequences: [
          {
            id: 'seq-1',
            name: 'Fitout',
            tasks: [
              { id: 'task-1', name: 'Install walls', order: 0, resultSetIds: ['set-1'] },
              { id: 'task-2', name: 'Install doors', order: 1 },
            ],
          },
        ],
        activeSequenceId: 'seq-1',
        activeTaskId: 'task-1',
        savedResultSets: [{ id: 'set-1', name: 'Wall package', elementIds: ['ifc:wall-1'] }],
        selectedElementId: 'ifc:wall-1',
        queryElementIds: ['ifc:wall-1'],
        onCreateResultSet: () => {},
        onCreateSequence: () => {},
        onCreateTask: () => {},
        onSetActiveSequence: () => {},
        onSetActiveTask: () => {},
        onStepTask: () => {},
      }),
    );

    expect(html).toContain('4D sequencing');
    expect(html).toContain('Fitout');
    expect(html).toContain('Install walls');
    expect(html).toContain('1 saved result set available');
  });

  it('renders 5D takeoff controls with cost totals and row actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(Bim5dHud, {
        preparedModel: {
          elements: [element],
          properties: [
            { id: 'q1', elementId: element.id, source: 'ifc-quantity', propertyName: 'NetSideArea', value: 12, unit: 'm2' },
          ],
        },
        costPlans: [
          {
            id: 'plan-1',
            name: 'Concept cost',
            currency: 'AUD',
            groupBy: 'ifcClass',
            rateRows: [
              { id: 'rate-1', label: 'Wall area', match: { ifcClass: 'IfcWall' }, quantityName: 'Area', unit: 'm2', unitCost: 50 },
            ],
          },
        ],
        activeCostPlanId: 'plan-1',
        savedResultSets: [],
        onCreateCostPlan: () => {},
        onSetActiveCostPlan: () => {},
        onPatchCostPlan: () => {},
        onAddRateRow: () => {},
        onSelectTakeoffRow: () => {},
      }),
    );

    expect(html).toContain('5D takeoff');
    expect(html).toContain('Concept cost');
    expect(html).toContain('AUD 600');
    expect(html).toContain('IfcWall');
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

  it('renders the HDRI lighting toggle in the style settings HUD for standard render', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimStyleSettingsHud, {
        renderStyle: 'standard',
        viewportBackgroundColor: '#ffffff',
        onViewportBackgroundChange: () => {},
        showEnvironment: false,
        environmentPreset: 'studio',
        onToggleLighting: () => {},
        wireframeMode: false,
      }),
    );
    expect(html).toContain('Lighting: off');
  });

  it('hides HDRI lighting in the style settings HUD for clay render', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimStyleSettingsHud, {
        renderStyle: 'clay',
        viewportBackgroundColor: '#ffffff',
        onViewportBackgroundChange: () => {},
        showEnvironment: false,
        environmentPreset: 'studio',
        onToggleLighting: () => {},
        wireframeMode: false,
        clayAoIntensity: 0,
        clayAoRadius: 0.0005,
        clayAoBias: 0.05,
        clayAoDistance: 0.17,
        clayAoSamples: 256,
        clayAoResolution: 1,
        clayLightIntensity: 2,
        claySurfaceColor: '#ffffff',
        clayGlassOpacity: 0.5,
        clayOriginalColorBlend: 1,
        onClayStyleChange: () => {},
      }),
    );
    expect(html).not.toContain('Lighting: off');
    expect(html).toContain('Viewport background colour');
  });

  it('places side panel toggles before measurement controls in the BIM viewport', () => {
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
    expect(html.indexOf('Collapse element list')).toBeLessThan(html.indexOf('Measure'));
  });

  it('renders style toolbar controls for highlight mode without clay or wireframe', () => {
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
        renderStyle: 'standard',
        wireframeMode: false,
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Show style settings panel');
    expect(html).not.toContain('Viewport background colour');
    expect(html).not.toContain('Clay style controls');
    expect(html).not.toContain('Wireframe style controls');
  });

  it('renders style toolbar controls for ghost mode without clay or wireframe', () => {
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
        displayMode: 'ghostOthers',
        renderStyle: 'standard',
        wireframeMode: false,
        onDisplayModeChange: () => {},
      }),
    );
    expect(html).toContain('Show style settings panel');
    expect(html).not.toContain('Viewport background colour');
  });

  it('renders shared style settings in the style settings HUD for highlight mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimStyleSettingsHud, {
        renderStyle: 'standard',
        wireframeMode: false,
        viewportBackgroundColor: '#171412',
        onViewportBackgroundChange: () => {},
        showEnvironment: false,
        environmentPreset: 'studio',
        onToggleLighting: () => {},
      }),
    );
    expect(html).toContain('Style settings');
    expect(html).toContain('Viewport background colour');
    expect(html).not.toContain('Clay style controls');
    expect(html).not.toContain('Wireframe style controls');
  });

  it('renders the wireframe toggle and style settings icon in the BIM viewport', () => {
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
    expect(html).toContain('Show style settings panel');
    expect(html).not.toContain('Wireframe style controls');
  });

  it('renders wireframe style controls in the floating style HUD', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimStyleSettingsHud, {
        wireframeMode: true,
        viewportBackgroundColor: '#ffffff',
        onViewportBackgroundChange: () => {},
        wireframeLineWeight: 1,
        wireframeOpacity: 0.5,
        wireframeColor: '#000000',
        wireframeHiddenLines: true,
        onWireframeStyleChange: () => {},
      }),
    );
    expect(html).toContain('Wireframe style controls');
    expect(html).toContain('Wireframe line weight');
    expect(html).toContain('Wireframe transparency');
    expect(html).toContain('Wireframe colour');
  });

  it('renders clay style controls in the floating style HUD', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimStyleSettingsHud, {
        renderStyle: 'clay',
        wireframeMode: false,
        viewportBackgroundColor: '#ffffff',
        onViewportBackgroundChange: () => {},
        clayAoIntensity: 10,
        clayAoRadius: 0.05,
        clayAoBias: 0.17,
        clayAoDistance: 0.23,
        clayAoSamples: 256,
        clayAoResolution: 1,
        clayLightIntensity: 2,
        claySurfaceColor: '#cccccc',
        clayGlassOpacity: 0.35,
        clayOriginalColorBlend: 0.5,
        onClayStyleChange: () => {},
      }),
    );
    expect(html).toContain('Clay style controls');
    expect(html).toContain('Clay AO bias');
    expect(html).toContain('Clay light intensity');
    expect(html).toContain('Clay glass opacity');
    expect(html).toContain('Clay surface material blend');
    expect(html).toContain('2.00');
    expect(html).toContain('0.35');
    expect(html).toContain('50%');
  });

  it('renders the clay toggle and style settings icon when clay render is active', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewport, {
        preparedModel: {
          metadata: { fragmentsStatus: 'success', fragmentsSourceKind: 'fragments' },
          fragmentsBlob: new Blob([new Uint8Array([1, 2, 3])]),
          elements: [element],
        },
        selectedElement: null,
        displayMode: 'highlight',
        renderStyle: 'clay',
        onDisplayModeChange: () => {},
        onRenderStyleChange: () => {},
      }),
    );
    expect(html).toContain('Clay render (Arctic)');
    expect(html).toContain('Show style settings panel');
    expect(html).toContain('Show layers panel');
    expect(html).toContain('Show section panel');
    expect(html).not.toContain('Clay style controls');
  });

  it('renders the layers HUD with storey and layer toggles', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimLayersHud, {
        catalog: {
          storeys: [{ id: 'Level 01', label: 'Level 01', count: 12 }],
          layers: [{ id: 'Structure', label: 'Structure', count: 8 }],
        },
        hiddenStoreys: [],
        hiddenLayers: ['Structure'],
        onToggleStorey: () => {},
        onToggleLayer: () => {},
        onShowAllStoreys: () => {},
        onHideAllStoreys: () => {},
        onShowAllLayers: () => {},
        onHideAllLayers: () => {},
      }),
    );
    expect(html).toContain('Layers &amp; storeys');
    expect(html).toContain('Level 01');
    expect(html).toContain('Structure');
  });

  it('renders the section HUD with style controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimSectionHud, {
        section: {
          enabled: true,
          showFills: true,
          showEdges: true,
          fillColor: '#e8e8e8',
          edgeColor: '#333333',
          edgeLineWeight: 1.5,
          planes: [{ id: 'section-plane-1', normal: [0, -1, 0], point: [0, 2, 0], enabled: true }],
        },
        bounds: { radius: 10, center: { x: 0, y: 0, z: 0 } },
        catalogStoreys: [{ id: 'Level 01', label: 'Level 01', count: 3 }],
        onPatchSection: () => {},
        onSetPlaneHeight: () => {},
        onFlipPlane: () => {},
        onApplyStoreyPreset: () => {},
      }),
    );
    expect(html).toContain('Section cut');
    expect(html).toContain('Plane height');
    expect(html).toContain('Section style');
    expect(html).toContain('Level 01');
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
    expect(html).not.toContain('BIM Evidence Agent');
    expect(html).toContain('Color by storey');
    expect(html).toContain('Saved walls');
  });

  it('renders the BIM agent controls in the floating agent HUD', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentHud, {
        agentText: '',
        onAgentTextChange: () => {},
        responderId: 'local-bim-rules',
        onResponderIdChange: () => {},
        selectedResponderLabel: `Local BIM Rules/${BIM_AGENT_INFO.model}`,
        responderLabel: 'Local BIM rules/local/bim-bql-rules-v0.1',
        providerStatus: { status: 'ready', label: 'ready', message: 'Local BIM Rules ready.' },
        agentRunState: {
          status: 'ready',
          message: 'Provider unavailable; answered with local BIM rules.',
          model: 'local/bim-bql-rules-v0.1',
          responderLabel: 'Local BIM rules',
        },
        onAskSelectedResponder: () => {},
        onRefreshAgentProviderState: () => {},
      }),
    );

    expect(html).toContain('BIM Evidence Agent');
    expect(html).toContain('local/bim-bql-rules-v0.1');
    expect(html).toContain('Local BIM Rules');
    expect(html).toContain('ChatGPT');
    expect(html).toContain('Mode: Local BIM Rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Responder: Local BIM rules/local/bim-bql-rules-v0.1');
    expect(html).toContain('Provider status: ready');
    expect(html).toContain('Send to model');
    expect(html).toContain('prepared IFC index');
    expect(html).toContain('Ask a BIM question to start a conversation.');
  });

  it('renders agent chat transcript and multiline input', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentHud, {
        agentText: 'How many slabs?',
        onAgentTextChange: () => {},
        chatMessages: [
          { id: 'user-1', role: 'user', content: 'How many slabs?' },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '12 slabs on ground floor found.',
            status: 'ready',
            response: {
              question: 'How many slabs?',
              answer: '12 slabs on ground floor found.',
              status: 'ready',
            },
          },
        ],
        responderId: 'local-bim-rules',
        onResponderIdChange: () => {},
        selectedResponderLabel: `Local BIM Rules/${BIM_AGENT_INFO.model}`,
        responderLabel: 'Local BIM rules/local/bim-bql-rules-v0.1',
        providerStatus: { status: 'ready', label: 'ready', message: 'Local BIM Rules ready.' },
        agentRunState: { status: 'idle', message: null },
        onAskSelectedResponder: () => {},
        onRefreshAgentProviderState: () => {},
      }),
    );

    expect(html).toContain('How many slabs?');
    expect(html).toContain('12 slabs on ground floor found.');
    expect(html).toContain('BIM agent request');
  });

  it('renders the BIM agent toggle in the viewport toolbar', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewport, {
        preparedModel: {
          metadata: { fragmentsStatus: 'success', fragmentsSourceKind: 'fragments' },
          fragmentsBlob: new Blob([new Uint8Array([1, 2, 3])]),
          elements: [element],
        },
        selectedElement: null,
        displayMode: 'highlight',
        onDisplayModeChange: () => {},
      }),
    );

    expect(html).toContain('Show BIM agent panel');
    expect(html).toContain('Show BQL query panel');
    expect(html).toContain('Show view carousel');
    expect(html).not.toContain('BIM Evidence Agent');
    expect(html).not.toContain('BQL query JSON');
  });

  it('renders the view carousel when open', () => {
    const camera = {
      position: [10, 8, 10],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 45,
      zoom: 1,
    };
    const view = createBimViewFromWorkspaceState({
      label: 'Plan A',
      workspaceState: { camera, projectionMode: 'perspective' },
    });
    const set = createBimViewSet({ name: 'PLANS' });
    set.views = [view];

    const html = renderToStaticMarkup(
      React.createElement(BimViewCarousel, {
        open: true,
        viewSets: [set],
        activeViewSetId: set.id,
        activeViewId: view.id,
        loadViewThumbnail: async () => null,
        onApplyView: () => {},
      }),
    );

    expect(html).toContain('View carousel');
    expect(html).toContain('PLANS');
    expect(html).toContain('Plan A');
    expect(html).toContain('Save view');
    expect(html).toContain('max-w-[75vw]');
  });

  it('hides the view carousel when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewCarousel, {
        open: false,
        viewSets: [],
      }),
    );
    expect(html).toBe('');
  });

  it('shows the view carousel toggle as active when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewport, {
        preparedModel: {
          metadata: { fragmentsStatus: 'success', fragmentsSourceKind: 'fragments' },
          fragmentsBlob: new Blob([new Uint8Array([1, 2, 3])]),
          elements: [element],
        },
        selectedElement: null,
        displayMode: 'highlight',
        onDisplayModeChange: () => {},
        viewCarouselOpen: true,
      }),
    );

    expect(html).toContain('Hide view carousel');
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

  it('renders clarification agent responses without generated BQL', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentResponsePanel, {
        response: {
          question: 'How many slabs on first floor?',
          answer: 'I found Ground Floor, Level 1 and Roof. Do you mean Level 1?',
          selectedResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          actualResponder: 'Local BIM Rules/local/bim-bql-rules-v0.1',
          status: 'clarification',
          workSummary: 'Local rules need storey clarification',
          providerStatus: 'ready',
          providerStatusMessage: 'Local BIM Rules ready.',
          clarification: {
            kind: 'storey',
            question: 'I found Ground Floor, Level 1 and Roof. Do you mean Level 1?',
            suggestedValue: 'LEVEL 1',
            choices: [
              { value: 'GROUND FLOOR', label: 'Ground Floor' },
              { value: 'LEVEL 1', label: 'Level 1' },
              { value: 'ROOF', label: 'Roof' },
            ],
          },
          result: {
            status: 'clarification',
            summary: 'I found Ground Floor, Level 1 and Roof. Do you mean Level 1?',
          },
        },
      }),
    );

    expect(html).toContain('I found Ground Floor, Level 1 and Roof. Do you mean Level 1?');
    expect(html).toContain('Local rules need storey clarification');
    expect(html).not.toContain('Generated BQL');
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
      React.createElement(BimAgentHud, {
        agentText: '',
        onAgentTextChange: () => {},
        responderId: 'ollama-gemma-26b',
        onResponderIdChange: () => {},
        selectedResponderLabel: 'Gemma 26B Local/gemma4:26b',
        responderLabel: 'Gemma 26B Local/gemma4:26b',
        providerStatus: {
          status: 'apiOffline',
          label: 'API offline',
          message: 'Canvas API offline. Start with npm run dev:stack or npm run server.',
        },
        agentRunState: { status: 'idle', message: null },
        onAskSelectedResponder: () => {},
        onRefreshAgentProviderState: () => {},
        selectedConnector: { id: 'ollama-gemma-26b', label: 'Gemma 26B Local', model: 'gemma4:26b' },
      }),
    );

    expect(html).toContain('Mode: Gemma 26B Local/gemma4:26b');
    expect(html).toContain('Provider status: API offline');
    expect(html).toContain('Canvas API offline. Start with npm run dev:stack or npm run server.');
  });

  it('shows model missing readiness for unpulled Gemma', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimAgentHud, {
        agentText: '',
        onAgentTextChange: () => {},
        responderId: 'ollama-gemma-26b',
        onResponderIdChange: () => {},
        selectedResponderLabel: 'Gemma 26B Local/gemma4:26b',
        responderLabel: 'Gemma 26B Local/gemma4:26b',
        providerStatus: {
          status: 'modelMissing',
          label: 'model not pulled',
          message: 'gemma4:26b not pulled. Pull the model before asking Gemma 26B Local.',
        },
        agentRunState: { status: 'idle', message: null },
        onAskSelectedResponder: () => {},
        onRefreshAgentProviderState: () => {},
        selectedConnector: { id: 'ollama-gemma-26b', label: 'Gemma 26B Local', model: 'gemma4:26b' },
      }),
    );

    expect(html).toContain('Provider status: model not pulled');
    expect(html).toContain('gemma4:26b not pulled. Pull the model before asking Gemma 26B Local.');
  });
});
