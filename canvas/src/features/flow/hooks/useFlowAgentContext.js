import { useCallback, useMemo, useState } from 'react';
import {
  artifactCardIdsFromFlowNodes,
  expandFlowNodeNetwork,
  filterFlowSubgraph,
  formatFlowDiagramForAgent,
  formatFlowSubgraphForAgent,
} from '../domain/flowDocument.js';

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

  const scopeNodeIds = useMemo(() => {
    const snap = getFlowSnapshot();
    const allNodes = snap?.nodes ?? [];
    if (!selectedNodeIds.length) {
      return new Set(allNodes.map((node) => node.id));
    }
    if (includeNetwork) {
      return expandFlowNodeNetwork(selectedNodeIds, snap?.edges ?? []);
    }
    return new Set(selectedNodeIds);
  }, [selectedNodeIds, includeNetwork, getFlowSnapshot]);

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

  const loadFlowContextText = useCallback(async (card) => {
    if (!card || card.type !== 'flow') return null;
    const snap = getFlowSnapshot();
    if (!snap) return null;
    const meta = {
      title: snap.title ?? flowCard?.name ?? 'Untitled flow',
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
    setSelectedNodeIds,
    scopeNodeIds,
    selectionSummary,
    contextCards,
    loadFlowContextText,
  };
}
