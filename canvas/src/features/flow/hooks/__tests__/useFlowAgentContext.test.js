import { describe, expect, it } from 'vitest';
import { artifactCardIdsFromFlowNodes, filterFlowSubgraph } from '../../domain/flowDocument.js';
import {
  buildFlowContextSteps,
  resolveFlowAgentScope,
} from '../useFlowAgentContext.js';

const nodes = [
  { id: 'n1', type: 'local', data: { title: 'Define brief', localNodeType: 'action' } },
  { id: 'n2', type: 'artifact', data: { title: 'SPECIFICATION.md', cardId: 'card-spec' } },
  { id: 'n3', type: 'local', data: { title: 'Review spec', localNodeType: 'decision' } },
];

const edges = [
  { source: 'n1', target: 'n2' },
  { source: 'n2', target: 'n3' },
];

describe('useFlowAgentContext helpers', () => {
  it('removes one selected step from selected context', () => {
    const scope = resolveFlowAgentScope({
      nodes,
      edges,
      selectedNodeIds: ['n1', 'n2'],
      excludedNodeIds: new Set(['n1']),
      includeNetwork: false,
    });

    expect([...scope]).toEqual(['n2']);
    const subgraph = filterFlowSubgraph(nodes, edges, scope);
    expect(subgraph.nodes.map((node) => node.id)).toEqual(['n2']);
  });

  it('keeps remaining selected steps after one is removed', () => {
    const scope = resolveFlowAgentScope({
      nodes,
      edges,
      selectedNodeIds: ['n1', 'n2', 'n3'],
      excludedNodeIds: new Set(['n2']),
      includeNetwork: false,
    });

    expect([...scope]).toEqual(['n1', 'n3']);
  });

  it('removes artifact context when the artifact step is excluded', () => {
    const scope = resolveFlowAgentScope({
      nodes,
      edges,
      selectedNodeIds: ['n2'],
      excludedNodeIds: new Set(['n2']),
      includeNetwork: false,
    });

    expect([...scope]).toEqual([]);
    expect(artifactCardIdsFromFlowNodes(nodes, scope)).toEqual([]);
  });

  it('prevents connected-network expansion from walking through removed steps', () => {
    const scope = resolveFlowAgentScope({
      nodes,
      edges,
      selectedNodeIds: ['n1'],
      excludedNodeIds: new Set(['n2']),
      includeNetwork: true,
    });

    expect([...scope]).toEqual(['n1']);
  });

  it('builds display rows for scoped exploration steps', () => {
    const steps = buildFlowContextSteps(nodes, new Set(['n1', 'n2']));

    expect(steps).toEqual([
      { id: 'n1', title: 'Define brief', typeLabel: 'Action', kind: 'local' },
      { id: 'n2', title: 'SPECIFICATION.md', typeLabel: 'Artifact', kind: 'artifact' },
    ]);
  });
});
