import { useCallback, useMemo, useState } from 'react';
import {
  artifactCardIdsFromFlowNodes,
  filterFlowSubgraph,
  flowNodeDisplayTitle,
  formatFlowDiagramForAgent,
  formatFlowSubgraphForAgent,
  UNTITLED_EXPLORATION_TITLE,
} from '../domain/flowDocument.js';

function expandFlowNodeNetworkExcluding(nodeIds, edges, excludedNodeIds) {
  const excluded = excludedNodeIds instanceof Set
    ? excludedNodeIds
    : new Set(excludedNodeIds ?? []);
  const seeds = [...nodeIds].filter((id) => id && !excluded.has(id));
  if (!seeds.length) return new Set();
  const visited = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges ?? []) {
      const neighbors = [];
      if (edge.source === current) neighbors.push(edge.target);
      if (edge.target === current) neighbors.push(edge.source);
      for (const neighbor of neighbors) {
        if (!neighbor || excluded.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

export function resolveFlowAgentScope({
  nodes = [],
  edges = [],
  selectedNodeIds = [],
  excludedNodeIds = new Set(),
  includeNetwork = true,
} = {}) {
  const allNodeIds = (nodes ?? []).map((node) => node.id).filter(Boolean);
  if (!selectedNodeIds.length) {
    return new Set(allNodeIds);
  }

  const excluded = excludedNodeIds instanceof Set
    ? excludedNodeIds
    : new Set(excludedNodeIds ?? []);
  const seedIds = selectedNodeIds.filter((id) => id && !excluded.has(id));
  if (!seedIds.length) return new Set();
  return includeNetwork
    ? expandFlowNodeNetworkExcluding(seedIds, edges, excluded)
    : new Set(seedIds);
}

function flowContextStepKind(node) {
  return node?.type === 'artifact' ? 'artifact' : 'local';
}

function flowContextStepTypeLabel(node) {
  if (node?.type === 'artifact') return 'Artifact';
  const raw = node?.data?.localNodeType ?? 'step';
  return String(raw)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function buildFlowContextSteps(nodes = [], scopeNodeIds = new Set()) {
  const ids = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds ?? []);
  return (nodes ?? [])
    .filter((node) => ids.has(node.id))
    .map((node) => ({
      id: node.id,
      title: flowNodeDisplayTitle(node),
      typeLabel: flowContextStepTypeLabel(node),
      kind: flowContextStepKind(node),
    }));
}

/**
 * Flow-modal agent context: node selection, optional network expansion, context cards.
 *
 * @param {{
 *   flowCard: object,
 *   canvasCards?: object[],
 *   getFlowSnapshot: () => { title?: string, description?: string, nodes?: object[], edges?: object[] } | null,
 * }} options
 */
export function useFlowAgentContext({ flowCard, canvasCards = [], getFlowSnapshot }) {
  const [includeNetwork, setIncludeNetwork] = useState(true);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [excludedNodeIds, setExcludedNodeIds] = useState(() => new Set());

  const setSelectedNodeIdsForContext = useCallback((nodeIds) => {
    setSelectedNodeIds(nodeIds);
    setExcludedNodeIds(new Set());
  }, []);

  const scopeNodeIds = useMemo(() => {
    const snap = getFlowSnapshot();
    const allNodes = snap?.nodes ?? [];
    return resolveFlowAgentScope({
      nodes: allNodes,
      edges: snap?.edges ?? [],
      selectedNodeIds,
      excludedNodeIds,
      includeNetwork,
    });
  }, [selectedNodeIds, excludedNodeIds, includeNetwork, getFlowSnapshot]);

  const flowContextSteps = useMemo(() => {
    const snap = getFlowSnapshot();
    return buildFlowContextSteps(snap?.nodes ?? [], scopeNodeIds);
  }, [getFlowSnapshot, scopeNodeIds]);

  const selectionSummary = useMemo(() => {
    const snap = getFlowSnapshot();
    const nodes = snap?.nodes ?? [];
    const edges = snap?.edges ?? [];
    if (!selectedNodeIds.length) {
      return {
        isFullFlow: true,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      };
    }
    const subgraph = filterFlowSubgraph(nodes, edges, scopeNodeIds);
    return {
      isFullFlow: false,
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
    };
  }, [selectedNodeIds.length, scopeNodeIds, getFlowSnapshot]);

  const contextCards = useMemo(() => {
    if (!flowCard) return [];
    const snap = getFlowSnapshot();
    const artifactIds = artifactCardIdsFromFlowNodes(snap?.nodes ?? [], scopeNodeIds);
    const byId = new Map((canvasCards ?? []).map((c) => [c.id, c]));
    const artifacts = artifactIds.map((id) => byId.get(id)).filter(Boolean);
    const merged = [flowCard, ...artifacts];
    const seen = new Set();
    return merged.filter((c) => {
      if (!c?.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [flowCard, canvasCards, scopeNodeIds, getFlowSnapshot]);

  const removeNodeFromContext = useCallback((nodeId) => {
    if (!nodeId || !selectedNodeIds.length) return;
    setExcludedNodeIds((current) => {
      if (current.has(nodeId)) return current;
      const next = new Set(current);
      next.add(nodeId);
      return next;
    });
  }, [selectedNodeIds.length]);

  const clearFlowContextExclusions = useCallback(() => {
    setExcludedNodeIds(new Set());
  }, []);

  const loadFlowContextText = useCallback(async (card) => {
    if (!card || card.type !== 'flow') return null;
    const snap = getFlowSnapshot();
    if (!snap) return null;
    const meta = {
      title: snap.title ?? flowCard?.name ?? UNTITLED_EXPLORATION_TITLE,
      description: snap.description ?? '',
    };
    if (!selectedNodeIds.length) {
      return formatFlowDiagramForAgent(meta, snap.nodes ?? [], snap.edges ?? []);
    }
    const subgraph = filterFlowSubgraph(snap.nodes ?? [], snap.edges ?? [], scopeNodeIds);
    return formatFlowSubgraphForAgent(meta, subgraph.nodes, subgraph.edges);
  }, [flowCard?.name, getFlowSnapshot, scopeNodeIds, selectedNodeIds.length]);

  return {
    includeNetwork,
    setIncludeNetwork,
    selectedNodeIds,
    setSelectedNodeIds: setSelectedNodeIdsForContext,
    excludedNodeIds,
    scopeNodeIds,
    flowContextSteps,
    selectionSummary,
    contextCards,
    removeNodeFromContext,
    clearFlowContextExclusions,
    loadFlowContextText,
  };
}
