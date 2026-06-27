import {
  ARCHITECTURE_GRAPH_NODES,
  ARCHITECTURE_GRAPH_PIPES,
} from './architectureGraphData.js';
import { validateNodes, validatePipes } from './architectureGraphSchema.js';
import {
  computeArchitectureNodeLayouts,
  buildEdgeRoutingMetadata,
} from './architectureEdgeRouting.js';
import {
  LAYER_ORDER,
  LAYER_Y,
  LAYER_LABELS,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_GAP_X,
  LAYER_GROUP_PADDING,
} from './architectureLayoutConstants.js';

function layoutNodes(nodes) {
  const byLayer = new Map();
  for (const layer of LAYER_ORDER) byLayer.set(layer, []);
  for (const node of nodes) {
    byLayer.get(node.layer)?.push(node);
  }

  const flowNodes = [];
  const layerGroups = [];

  for (const layer of LAYER_ORDER) {
    const layerNodes = byLayer.get(layer) ?? [];
    if (layerNodes.length === 0) continue;
    const groupId = `layer-${layer}`;
    const rowWidth = layerNodes.length * NODE_WIDTH + (layerNodes.length - 1) * NODE_GAP_X;
    const groupWidth = rowWidth + LAYER_GROUP_PADDING * 2;
    const groupHeight = NODE_HEIGHT + 48 + LAYER_GROUP_PADDING * 2;

    layerGroups.push({
      id: groupId,
      type: 'architectureLayer',
      position: { x: 40, y: LAYER_Y[layer] },
      data: { label: LAYER_LABELS[layer], layer },
      style: { width: groupWidth, height: groupHeight },
      selectable: false,
      draggable: false,
    });

    layerNodes.forEach((node, index) => {
      flowNodes.push({
        id: node.id,
        type: 'architecture',
        parentId: groupId,
        extent: 'parent',
        position: {
          x: LAYER_GROUP_PADDING + index * (NODE_WIDTH + NODE_GAP_X),
          y: 36,
        },
        data: { nodeDef: node },
      });
    });
  }

  return [...layerGroups, ...flowNodes];
}

function layoutEdges(pipes, layouts) {
  return buildEdgeRoutingMetadata(pipes, layouts).map((meta) => ({
    id: meta.pipe.id,
    source: meta.pipe.source,
    target: meta.pipe.target,
    sourceHandle: meta.routing.sourceHandle,
    targetHandle: meta.routing.targetHandle,
    type: 'architecture',
    label: meta.pipe.pipeLabel,
    data: {
      pipeDef: meta.pipe,
      parallelIndex: meta.parallelIndex,
      parallelTotal: meta.parallelTotal,
      routeStyle: meta.routing.routeStyle,
      topology: meta.routing.topology,
      bulgeSide: meta.routing.bulgeSide,
      archSide: meta.routing.archSide,
      laneOffset: meta.laneOffset,
      busSide: meta.busSide,
      busLane: meta.busLane,
      targetEntryX: meta.targetEntryX,
      sourceEntryX: meta.sourceEntryX,
      targetFanIndex: meta.targetFanIndex,
      targetFanTotal: meta.targetFanTotal,
      maxRightX: meta.maxRightX,
    },
  }));
}

validateNodes(ARCHITECTURE_GRAPH_NODES);
const nodeIds = new Set(ARCHITECTURE_GRAPH_NODES.map((n) => n.id));
validatePipes(ARCHITECTURE_GRAPH_PIPES, nodeIds);

export const ARCHITECTURE_NODES = ARCHITECTURE_GRAPH_NODES;
export const ARCHITECTURE_PIPES = ARCHITECTURE_GRAPH_PIPES;

const architectureNodeLayouts = computeArchitectureNodeLayouts(ARCHITECTURE_GRAPH_NODES);

export function getArchitectureReactFlowNodes() {
  return layoutNodes(ARCHITECTURE_GRAPH_NODES);
}

export function getArchitectureReactFlowEdges() {
  return layoutEdges(ARCHITECTURE_GRAPH_PIPES, architectureNodeLayouts);
}

export function getArchitectureNodeById(id) {
  return ARCHITECTURE_GRAPH_NODES.find((n) => n.id === id) ?? null;
}

export function getArchitecturePipeById(id) {
  return ARCHITECTURE_GRAPH_PIPES.find((p) => p.id === id) ?? null;
}

/**
 * Direct neighbors and incident pipes for a node (undirected 1-hop).
 * @param {string | null | undefined} nodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 */
export function getArchitectureNeighborhood(nodeId, pipes) {
  const nodeIds = new Set();
  const edgeIds = new Set();
  if (!nodeId) return { nodeIds, edgeIds };
  for (const pipe of pipes) {
    if (pipe.source !== nodeId && pipe.target !== nodeId) continue;
    edgeIds.add(pipe.id);
    if (pipe.source === nodeId) nodeIds.add(pipe.target);
    if (pipe.target === nodeId) nodeIds.add(pipe.source);
  }
  return { nodeIds, edgeIds };
}

/**
 * System overview selection: focus node (current) + touched neighbors (path).
 * @param {string | null | undefined} selectedNodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 */
export function getOverviewHighlight(selectedNodeId, pipes) {
  const empty = {
    currentNodeIds: new Set(),
    currentEdgeIds: new Set(),
    pathNodeIds: new Set(),
    pathEdgeIds: new Set(),
  };
  if (!selectedNodeId) return empty;
  const neighborhood = getArchitectureNeighborhood(selectedNodeId, pipes);
  return {
    currentNodeIds: new Set([selectedNodeId]),
    currentEdgeIds: new Set(),
    pathNodeIds: neighborhood.nodeIds,
    pathEdgeIds: neighborhood.edgeIds,
  };
}

export { LAYER_LABELS, LAYER_ORDER };
