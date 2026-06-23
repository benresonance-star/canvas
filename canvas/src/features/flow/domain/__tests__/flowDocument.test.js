import { describe, expect, it, vi } from 'vitest';
import {
  defaultFlowNodePreviewSize,
  FLOW_EDGE_TYPE,
  FLOW_EDGE_DIRECTION,
  flowEdgeIsFlowing,
  flowEdgeDirection,
  flowEdgeEffectiveEndpoints,
  flowEdgeEndpointTitles,
  expandFlowNodeNetwork,
  filterFlowSubgraph,
  artifactCardIdsFromFlowNodes,
  formatFlowDiagramForAgent,
  formatFlowSubgraphForAgent,
  flowGraphFromPreview,
  flowArtifactNodeDisplayTitle,
  flowPreviewArtifactNodeLabel,
  flowCardFromDocument,
  flowNodeDisplayTitle,
  flowNodePreviewFilename,
  newArtifactFlowNode,
  normalizeFlowEdgeForEditor,
  normalizeFlowNodeForEditor,
  patchFlowCard,
  patchFlowNodePresentation,
  previewFromFlow,
  formatFlowSaveError,
  removeFlowEdgesById,
  removeFlowNodesById,
  snapshotForSave,
  exportFlowRelationships,
  normalizeFlowEdgeProperties,
  patchFlowEdge,
  validateFlowEdgeMetadata,
} from '../flowDocument.js';

describe('flow document isolation', () => {
  it('creates independent instances that only reference the source artifact', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'instance-1') });
    const source = {
      id: 'card-1',
      name: 'Source document',
      type: 'pdf',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'artifact-1', type: 'artifact' } }],
    };
    const before = structuredClone(source);
    const node = newArtifactFlowNode(source, { x: 20, y: 30 });
    expect(node).toMatchObject({
      id: 'instance-1',
      type: 'artifact',
      artifactId: 'artifact-1',
      position: { x: 20, y: 30 },
    });
    expect(source).toEqual(before);
    vi.unstubAllGlobals();
  });

  it('refreshes only flow card metadata and preserves outer canvas fields', () => {
    const card = {
      id: 'outer-card',
      name: 'Old title',
      type: 'flow',
      x: 111,
      y: 222,
      w: 360,
      h: 240,
      clusterId: 'cluster-1',
      pinnedVersion: 1,
      versions: [{ version: 1, flowId: 'flow-1', artifactRef: { id: 'flow-1' } }],
    };
    const updates = patchFlowCard(
      card,
      { id: 'flow-1', title: 'New title', snapshotPath: 'flows/new.flow.json' },
      [{ id: 'n1', type: 'local', position: { x: 1, y: 2 } }],
      [],
    );
    const next = { ...card, ...updates };
    expect(next).toMatchObject({ x: 111, y: 222, w: 360, h: 240, clusterId: 'cluster-1' });
    expect(next.name).toBe('New title');
    expect(Object.keys(updates).sort()).toEqual(['name', 'versions']);
  });

  it('serializes only flow-owned geometry and references', () => {
    const sourceArtifact = { id: 'artifact-1', payload: 'must not leak' };
    const snapshot = snapshotForSave(
      { revision: 4, title: 'Flow', description: '' },
      [{
        id: 'node-1',
        type: 'artifact',
        artifactId: sourceArtifact.id,
        position: { x: 1, y: 2 },
        data: { title: 'Reference' },
      }],
      [],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.expectedRevision).toBe(4);
    expect(snapshot.nodes[0].artifactId).toBe('artifact-1');
    expect(JSON.stringify(snapshot)).not.toContain('must not leak');
  });

  it('creates an ordinary outer card without embedding the flow document', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'card-1') });
    const card = flowCardFromDocument({ id: 'flow-1', title: 'Plan', nodes: [], edges: [] });
    expect(card).toMatchObject({ id: 'card-1', type: 'flow', key: 'flows__flow-1' });
    expect(card.versions[0].artifactRef).toEqual({ id: 'flow-1', type: 'artifact' });
    vi.unstubAllGlobals();
  });

  it('removeFlowEdgesById drops only the requested connections', () => {
    const edges = [
      { id: 'edge-a', source: 'n1', target: 'n2' },
      { id: 'edge-b', source: 'n2', target: 'n3' },
    ];
    expect(removeFlowEdgesById(edges, 'edge-a')).toEqual([
      { id: 'edge-b', source: 'n2', target: 'n3' },
    ]);
    expect(removeFlowEdgesById(edges, ['edge-a', 'edge-b'])).toEqual([]);
  });

  it('removeFlowNodesById drops nodes and any connected edges', () => {
    const nodes = [
      { id: 'n1', type: 'local' },
      { id: 'n2', type: 'local' },
      { id: 'n3', type: 'local' },
    ];
    const edges = [
      { id: 'edge-a', source: 'n1', target: 'n2' },
      { id: 'edge-b', source: 'n2', target: 'n3' },
    ];
    expect(removeFlowNodesById(nodes, edges, 'n2')).toEqual({
      nodes: [
        { id: 'n1', type: 'local' },
        { id: 'n3', type: 'local' },
      ],
      edges: [],
    });
  });

  it('snapshotForSave serializes remaining edges after removal', () => {
    const nodes = [
      { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } },
      { id: 'n2', type: 'local', position: { x: 100, y: 0 }, data: { title: 'B' } },
    ];
    const edges = [
      { id: 'edge-a', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'edge-b', source: 'n2', target: 'n1', type: 'smoothstep' },
    ];
    const snapshot = snapshotForSave(
      { revision: 2, title: 'Flow', description: '' },
      nodes,
      removeFlowEdgesById(edges, 'edge-a'),
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.edges).toEqual([
      {
        id: 'edge-b',
        source: 'n2',
        target: 'n1',
        sourceHandle: null,
        targetHandle: null,
        label: '',
        data: {
          edgeType: FLOW_EDGE_TYPE,
          connectionTypeId: '',
          connectionTypeCustom: '',
          properties: {},
        },
      },
    ]);
  });

  it('flowNodeDisplayTitle falls back to Untitled node', () => {
    expect(flowNodeDisplayTitle({ data: { title: ' Step ' } })).toBe('Step');
    expect(flowNodeDisplayTitle({ data: { title: '   ' } })).toBe('Untitled node');
    expect(flowNodeDisplayTitle(null)).toBe('Untitled node');
  });

  it('defaultFlowNodePreviewSize uses card type defaults for artifact nodes', () => {
    const card = { type: 'pdf', width: 400, height: 500 };
    expect(defaultFlowNodePreviewSize({ type: 'artifact' }, card)).toEqual({
      width: 400,
      height: 500,
    });
    expect(defaultFlowNodePreviewSize({ type: 'local' })).toEqual({
      width: 300,
      height: 200,
    });
  });

  it('patchFlowNodePresentation merges data and dimensions', () => {
    const node = { id: 'n1', type: 'local', data: { title: 'A' }, style: {} };
    const next = patchFlowNodePresentation(node, { showContent: true }, { width: 320, height: 220 });
    expect(next.data).toEqual({ title: 'A', showContent: true });
    expect(next.width).toBe(320);
    expect(next.height).toBe(220);
    expect(next.style).toEqual({ width: 320, height: 220 });
  });

  it('normalizeFlowNodeForEditor applies saved dimensions to style when expanded', () => {
    const node = {
      id: 'n1',
      type: 'artifact',
      width: 280,
      height: 320,
      data: { showContent: true },
      style: {},
    };
    const normalized = normalizeFlowNodeForEditor(node);
    expect(normalized.style).toEqual({ width: 280, height: 320 });
  });

  it('normalizeFlowNodeForEditor strips stale dimensions from collapsed nodes', () => {
    const node = {
      id: 'n1',
      type: 'artifact',
      width: 280,
      height: 320,
      measured: { width: 280, height: 320 },
      data: { showContent: false },
      style: { width: 280, height: 320 },
    };
    const normalized = normalizeFlowNodeForEditor(node);
    expect(normalized.width).toBeUndefined();
    expect(normalized.height).toBeUndefined();
    expect(normalized.measured).toBeUndefined();
    expect(normalized.style).toEqual({});
  });

  it('snapshotForSave omits dimensions for collapsed nodes', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [{
        id: 'node-1',
        type: 'artifact',
        artifactId: 'artifact-1',
        position: { x: 0, y: 0 },
        width: 320,
        height: 220,
        measured: { width: 320, height: 220 },
        data: { title: 'Doc', showContent: false, cardId: 'card-1' },
      }],
      [],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.nodes[0].width).toBeNull();
    expect(snapshot.nodes[0].height).toBeNull();
  });

  it('snapshotForSave retains showContent in node data', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [{
        id: 'node-1',
        type: 'artifact',
        artifactId: 'artifact-1',
        position: { x: 0, y: 0 },
        width: 320,
        height: 220,
        data: { title: 'Doc', showContent: true, cardId: 'card-1' },
      }],
      [],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.nodes[0].data.showContent).toBe(true);
    expect(snapshot.nodes[0].width).toBe(320);
    expect(snapshot.nodes[0].height).toBe(220);
  });

  it('previewFromFlow includes node titles and flow description', () => {
    const preview = previewFromFlow(
      [
        { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'Step one' } },
        { id: 'n2', type: 'artifact', position: { x: 100, y: 0 }, data: { title: '   ' } },
      ],
      [{ source: 'n1', target: 'n2' }],
      { description: '  Onboarding overview  ' },
    );
    expect(preview.description).toBe('Onboarding overview');
    expect(preview.nodes[0].title).toBe('Step one');
    expect(preview.nodes[1].title).toBe('Untitled node');
    expect(preview.nodes[1].displayFilename).toBe('Untitled node');
    expect(preview.edges).toEqual([{
      source: 'n1',
      target: 'n2',
      flowing: false,
      direction: FLOW_EDGE_DIRECTION.forward,
      label: '',
      connectionTypeId: '',
      connectionTypeCustom: '',
      properties: {},
    }]);
  });

  it('previewFromFlow uses empty description when meta is missing', () => {
    const preview = previewFromFlow(
      [{ id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: {} }],
      [],
    );
    expect(preview.description).toBe('');
    expect(preview.nodes[0].title).toBe('Untitled node');
  });

  it('patchFlowCard embeds description in flowPreview', () => {
    const card = {
      pinnedVersion: 1,
      versions: [{ version: 1, flowId: 'flow-1' }],
    };
    const updates = patchFlowCard(
      card,
      { id: 'flow-1', title: 'Plan', description: 'High-level steps' },
      [{ id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'Start' } }],
      [],
    );
    expect(updates.versions[0].flowPreview).toEqual({
      description: 'High-level steps',
      nodes: [{
        id: 'n1',
        x: 0,
        y: 0,
        type: 'local',
        title: 'Start',
      }],
      edges: [],
    });
  });

  it('patchFlowCard includes every node passed from the editor save snapshot', () => {
    const card = {
      pinnedVersion: 1,
      versions: [{ version: 1, flowId: 'flow-1', flowPreview: { description: '', nodes: [], edges: [] } }],
    };
    const nodes = [
      { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'Start' } },
      { id: 'n2', type: 'local', position: { x: 120, y: 40 }, data: { title: 'Next' } },
    ];
    const updates = patchFlowCard(card, { id: 'flow-1', title: 'Plan', description: '' }, nodes, []);
    expect(updates.versions[0].flowPreview.nodes).toHaveLength(2);
    expect(updates.versions[0].flowPreview.nodes[1]).toMatchObject({
      id: 'n2',
      x: 120,
      y: 40,
      title: 'Next',
    });
  });

  it('flowNodePreviewFilename returns displayFilename with extension', () => {
    const node = {
      type: 'artifact',
      data: {
        displayFilename: 'agent.ts',
        title: 'agent',
        artifactExt: 'ts',
      },
    };
    expect(flowNodePreviewFilename(node)).toBe('agent.ts');
  });

  it('flowNodePreviewFilename builds title plus extension fallback', () => {
    const node = {
      type: 'artifact',
      data: { title: 'agent', artifactExt: 'ts' },
    };
    expect(flowNodePreviewFilename(node)).toBe('agent.ts');
  });

  it('flowArtifactNodeDisplayTitle prefers linked card over stale displayFilename', () => {
    expect(flowArtifactNodeDisplayTitle({ title: 'agent', displayFilename: 'agent.ts' })).toBe('agent.ts');
    expect(flowArtifactNodeDisplayTitle(
      { title: 'agent', displayFilename: 'agent' },
      { name: 'agent', type: 'code', versions: [{ version: 1, ext: 'ts' }], pinnedVersion: 1 },
    )).toBe('agent.ts');
    expect(flowArtifactNodeDisplayTitle(
      { title: 'Instructions' },
      { name: 'Instructions', type: 'markdown', versions: [{ version: 1, ext: 'md' }], pinnedVersion: 1 },
    )).toBe('Instructions.md');
    expect(flowArtifactNodeDisplayTitle({ title: 'agent', artifactExt: 'ts' })).toBe('agent.ts');
  });

  it('previewFromFlow includes displayFilename for artifact nodes', () => {
    const preview = previewFromFlow(
      [{
        id: 'n1',
        type: 'artifact',
        position: { x: 0, y: 0 },
        data: { title: 'agent', displayFilename: 'agent.ts', artifactExt: 'ts', cardId: 'card-1' },
      }],
      [],
    );
    expect(preview.nodes[0].displayFilename).toBe('agent.ts');
    expect(preview.nodes[0].title).toBe('agent');
    expect(preview.nodes[0].cardId).toBe('card-1');
    expect(preview.nodes[0].artifactExt).toBe('ts');
  });

  it('flowPreviewArtifactNodeLabel resolves extension from linked card', () => {
    const card = {
      id: 'card-md',
      name: 'Instructions',
      type: 'markdown',
      versions: [{ version: 1, ext: 'md', artifactRef: { id: 'art-md' } }],
      pinnedVersion: 1,
    };
    const cardsById = new Map([['card-md', card]]);
    expect(flowPreviewArtifactNodeLabel(
      { type: 'artifact', title: 'Instructions', cardId: 'card-md' },
      cardsById,
    )).toBe('Instructions.md');
    expect(flowPreviewArtifactNodeLabel(
      { type: 'artifact', title: 'Instructions', displayFilename: 'Instructions', artifactId: 'art-md' },
      cardsById,
    )).toBe('Instructions.md');
  });

  it('snapshotForSave persists smoothstep edge type in edge data', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [{ id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } }],
      [{
        id: 'edge-a',
        source: 'n1',
        target: 'n1',
        type: 'smoothstep',
        data: { note: 'keep' },
      }],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.edges[0].data).toEqual({
      note: 'keep',
      edgeType: FLOW_EDGE_TYPE,
      connectionTypeId: '',
      connectionTypeCustom: '',
      properties: {},
    });
  });

  it('normalizeFlowEdgeForEditor forces smoothstep type', () => {
    expect(normalizeFlowEdgeForEditor({ id: 'e1', source: 'a', target: 'b' })).toMatchObject({
      type: FLOW_EDGE_TYPE,
      animated: false,
    });
    expect(normalizeFlowEdgeForEditor({ id: 'e2', source: 'a', target: 'b', type: 'default' })).toMatchObject({
      type: FLOW_EDGE_TYPE,
      animated: false,
    });
  });

  it('flowEdgeIsFlowing reads data.flowing and animated fallback', () => {
    expect(flowEdgeIsFlowing({ data: { flowing: true } })).toBe(true);
    expect(flowEdgeIsFlowing({ data: { flowing: false }, animated: true })).toBe(false);
    expect(flowEdgeIsFlowing({ animated: true })).toBe(true);
    expect(flowEdgeIsFlowing(null)).toBe(false);
  });

  it('normalizeFlowEdgeForEditor maps data.flowing to animated', () => {
    expect(normalizeFlowEdgeForEditor({
      id: 'e1',
      source: 'a',
      target: 'b',
      data: { flowing: true },
    })).toMatchObject({
      type: FLOW_EDGE_TYPE,
      animated: true,
    });
  });

  it('snapshotForSave persists flowing in edge data', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [{ id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } }],
      [{
        id: 'edge-a',
        source: 'n1',
        target: 'n1',
        type: 'smoothstep',
        animated: true,
        data: { flowing: true },
      }],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.edges[0].data.flowing).toBe(true);
  });

  it('previewFromFlow includes flowing on edges', () => {
    const preview = previewFromFlow(
      [
        { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } },
        { id: 'n2', type: 'local', position: { x: 100, y: 0 }, data: { title: 'B' } },
      ],
      [
        { source: 'n1', target: 'n2', data: { flowing: true } },
        { source: 'n2', target: 'n1', data: { flowing: false } },
      ],
    );
    expect(preview.edges).toEqual([
      {
        source: 'n1',
        target: 'n2',
        flowing: true,
        direction: FLOW_EDGE_DIRECTION.forward,
        label: '',
        connectionTypeId: '',
        connectionTypeCustom: '',
        properties: {},
      },
      {
        source: 'n2',
        target: 'n1',
        flowing: false,
        direction: FLOW_EDGE_DIRECTION.forward,
        label: '',
        connectionTypeId: '',
        connectionTypeCustom: '',
        properties: {},
      },
    ]);
  });

  it('flowEdgeDirection defaults to forward and reads reverse', () => {
    expect(flowEdgeDirection({ data: {} })).toBe(FLOW_EDGE_DIRECTION.forward);
    expect(flowEdgeDirection({ data: { flowDirection: FLOW_EDGE_DIRECTION.reverse } }))
      .toBe(FLOW_EDGE_DIRECTION.reverse);
  });

  it('flowEdgeEffectiveEndpoints respects reverse direction', () => {
    const edge = { source: 'a', target: 'b', data: { flowDirection: FLOW_EDGE_DIRECTION.reverse } };
    expect(flowEdgeEffectiveEndpoints(edge)).toEqual({ from: 'b', to: 'a' });
    expect(flowEdgeEffectiveEndpoints({ source: 'a', target: 'b' })).toEqual({ from: 'a', to: 'b' });
  });

  it('flowEdgeEndpointTitles resolves node titles', () => {
    const nodesById = new Map([
      ['a', { data: { title: 'Start' } }],
      ['b', { data: { title: 'End' } }],
    ]);
    expect(flowEdgeEndpointTitles({ source: 'a', target: 'b' }, nodesById)).toEqual({
      fromTitle: 'Start',
      toTitle: 'End',
    });
  });

  it('normalizeFlowEdgeForEditor applies reverse marker and class', () => {
    expect(normalizeFlowEdgeForEditor({
      id: 'e1',
      source: 'a',
      target: 'b',
      data: { flowDirection: FLOW_EDGE_DIRECTION.reverse },
    })).toMatchObject({
      className: 'flow-edge-reverse',
      markerStart: { type: 'arrowclosed' },
    });
  });

  it('expandFlowNodeNetwork walks connected nodes', () => {
    const edges = [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n4', target: 'n5' },
    ];
    expect([...expandFlowNodeNetwork(['n1'], edges)].sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('filterFlowSubgraph keeps internal edges only', () => {
    const nodes = [
      { id: 'n1', type: 'local', data: { title: 'A' } },
      { id: 'n2', type: 'local', data: { title: 'B' } },
      { id: 'n3', type: 'local', data: { title: 'C' } },
    ];
    const edges = [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ];
    const subgraph = filterFlowSubgraph(nodes, edges, new Set(['n1', 'n2']));
    expect(subgraph.nodes.map((node) => node.id)).toEqual(['n1', 'n2']);
    expect(subgraph.edges).toHaveLength(1);
  });

  it('artifactCardIdsFromFlowNodes collects linked canvas cards', () => {
    const nodes = [
      { id: 'n1', type: 'artifact', data: { cardId: 'card-1' } },
      { id: 'n2', type: 'local', data: { title: 'Step' } },
    ];
    expect(artifactCardIdsFromFlowNodes(nodes, ['n1', 'n2'])).toEqual(['card-1']);
  });

  it('formatFlowDiagramForAgent lists effective connection direction', () => {
    const text = formatFlowDiagramForAgent(
      { title: 'Plan', description: 'Overview' },
      [
        { id: 'n1', type: 'local', data: { title: 'Kickoff' } },
        { id: 'n2', type: 'artifact', data: { title: 'agent.ts' } },
      ],
      [{
        source: 'n1',
        target: 'n2',
        data: { flowing: true, flowDirection: FLOW_EDGE_DIRECTION.reverse },
      }],
    );
    expect(text).toContain('# Flow: Plan');
    expect(text).toContain('agent.ts → Kickoff (animated, reversed)');
  });

  it('formatFlowSubgraphForAgent formats selected scope', () => {
    const text = formatFlowSubgraphForAgent(
      { title: 'Plan' },
      [{ id: 'n1', type: 'local', data: { title: 'Kickoff' } }],
      [],
    );
    expect(text).toContain('# Flow selection: Plan');
    expect(text).toContain('Kickoff');
  });

  it('flowGraphFromPreview rebuilds editor-shaped graph', () => {
    const graph = flowGraphFromPreview({
      description: 'd',
      nodes: [{ id: 'n1', x: 1, y: 2, type: 'local', title: 'A' }],
      edges: [{ source: 'n1', target: 'n1', flowing: true, direction: FLOW_EDGE_DIRECTION.reverse }],
    });
    expect(graph.nodes[0].position).toEqual({ x: 1, y: 2 });
    expect(graph.edges[0].data.flowDirection).toBe(FLOW_EDGE_DIRECTION.reverse);
    expect(graph.edges[0].data.properties).toEqual({});
  });

  it('snapshotForSave persists connection type, label, and properties', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [
        { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } },
        { id: 'n2', type: 'local', position: { x: 100, y: 0 }, data: { title: 'B' } },
      ],
      [{
        id: 'edge-a',
        source: 'n1',
        target: 'n2',
        data: {
          connectionTypeId: 'driven_by',
          properties: { format: 'json' },
        },
      }],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.edges[0]).toMatchObject({
      label: 'Driven by',
      data: {
        connectionTypeId: 'driven_by',
        connectionTypeCustom: '',
        properties: { format: 'json' },
      },
    });
  });

  it('patchFlowEdge resolves custom labels and normalizes properties', () => {
    const edge = patchFlowEdge(
      { id: 'e1', source: 'a', target: 'b', data: {} },
      {
        connectionTypeId: 'custom',
        connectionTypeCustom: 'feeds',
        properties: { weight: '0.8', bad: 1 },
      },
    );
    expect(edge.label).toBe('feeds');
    expect(edge.data.properties).toEqual({ weight: '0.8' });
  });

  it('patchFlowEdge retains detail for schema types and builds two-part labels', () => {
    const edge = patchFlowEdge(
      { id: 'e1', source: 'a', target: 'b', data: { connectionTypeId: 'driven_by' } },
      { connectionTypeCustom: 'Love' },
    );
    expect(edge.label).toBe('Driven by: Love');
    expect(edge.data.connectionTypeCustom).toBe('Love');
  });

  it('snapshotForSave persists detail with schema connection types', () => {
    const snapshot = snapshotForSave(
      { revision: 1, title: 'Flow', description: '' },
      [
        { id: 'n1', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } },
        { id: 'n2', type: 'local', position: { x: 100, y: 0 }, data: { title: 'B' } },
      ],
      [{
        id: 'edge-a',
        source: 'n1',
        target: 'n2',
        data: {
          connectionTypeId: 'driven_by',
          connectionTypeCustom: 'Love',
        },
      }],
      { x: 0, y: 0, zoom: 1 },
    );
    expect(snapshot.edges[0]).toMatchObject({
      label: 'Driven by: Love',
      data: {
        connectionTypeId: 'driven_by',
        connectionTypeCustom: 'Love',
      },
    });
  });

  it('formatFlowDiagramForAgent includes connection label and properties', () => {
    const text = formatFlowDiagramForAgent(
      { title: 'Plan' },
      [
        { id: 'n1', type: 'local', data: { title: 'A' } },
        { id: 'n2', type: 'local', data: { title: 'B' } },
      ],
      [{
        id: 'e1',
        source: 'n1',
        target: 'n2',
        data: {
          connectionTypeId: 'output_type',
          properties: { mime: 'text/plain' },
        },
      }],
    );
    expect(text).toContain('[Output type] mime=text/plain');
  });

  it('formatFlowDiagramForAgent includes two-part schema labels', () => {
    const text = formatFlowDiagramForAgent(
      { title: 'Plan' },
      [
        { id: 'n1', type: 'local', data: { title: 'A' } },
        { id: 'n2', type: 'local', data: { title: 'B' } },
      ],
      [{
        id: 'e1',
        source: 'n1',
        target: 'n2',
        data: {
          connectionTypeId: 'driven_by',
          connectionTypeCustom: 'Love',
        },
      }],
    );
    expect(text).toContain('[Driven by: Love]');
  });

  it('exportFlowRelationships includes connection metadata and direction', () => {
    const relationships = exportFlowRelationships(
      [{ id: 'n1' }, { id: 'n2' }],
      [{
        id: 'e1',
        source: 'n1',
        target: 'n2',
        data: { connectionTypeId: 'depends_on', flowDirection: FLOW_EDGE_DIRECTION.reverse },
      }],
    );
    expect(relationships[0]).toMatchObject({
      fromNodeId: 'n2',
      toNodeId: 'n1',
      connectionTypeId: 'depends_on',
      label: 'Depends on',
      detail: '',
      direction: FLOW_EDGE_DIRECTION.reverse,
    });
  });

  it('exportFlowRelationships includes detail for schema types', () => {
    const relationships = exportFlowRelationships(
      [{ id: 'n1' }, { id: 'n2' }],
      [{
        id: 'e1',
        source: 'n1',
        target: 'n2',
        data: { connectionTypeId: 'driven_by', connectionTypeCustom: 'Love' },
      }],
    );
    expect(relationships[0]).toMatchObject({
      label: 'Driven by: Love',
      detail: 'Love',
    });
  });

  it('flowGraphFromPreview round-trips connection metadata', () => {
    const graph = flowGraphFromPreview({
      nodes: [{ id: 'n1', x: 0, y: 0, type: 'local', title: 'A' }],
      edges: [{
        source: 'n1',
        target: 'n1',
        flowing: false,
        direction: FLOW_EDGE_DIRECTION.forward,
        label: 'Driven by',
        connectionTypeId: 'driven_by',
        connectionTypeCustom: '',
        properties: { scope: 'local' },
      }],
    });
    expect(graph.edges[0]).toMatchObject({
      label: 'Driven by',
      data: {
        connectionTypeId: 'driven_by',
        properties: { scope: 'local' },
      },
    });
  });

  it('validateFlowEdgeMetadata rejects unknown types and invalid custom labels', () => {
    expect(() => validateFlowEdgeMetadata({
      data: { connectionTypeId: 'unknown' },
    })).toThrow(/invalid flow edge connection type/);
    expect(() => validateFlowEdgeMetadata({
      data: { connectionTypeId: 'custom', connectionTypeCustom: '' },
    })).toThrow(/custom flow edge connection requires/);
    expect(normalizeFlowEdgeProperties({ ok: 'yes', bad: 2 })).toEqual({ ok: 'yes' });
  });
});

describe('formatFlowSaveError', () => {
  it('maps artifact project validation to a friendly message', () => {
    expect(formatFlowSaveError(
      'artifact nodes must reference artifacts in the same project',
      { artifactNotInProject: 'Sync the card first.' },
    )).toBe('Sync the card first.');
  });

  it('maps network failures separately from validation errors', () => {
    expect(formatFlowSaveError('Failed to fetch', { saveFailedNetwork: 'API down.' })).toBe('API down.');
  });
});

