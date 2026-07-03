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
 * All upstream feeders (transitive) following pipe direction target ← source.
 * @param {string | null | undefined} nodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 * @param {{ minDepth?: number }} [options]
 */
export function getArchitectureUpstreamFeed(nodeId, pipes, { minDepth = 1 } = {}) {
  const nodeIds = new Set();
  const edgeIds = new Set();
  if (!nodeId) return { nodeIds, edgeIds };

  /** @type {Map<string, number>} */
  const depthByNode = new Map([[nodeId, 0]]);
  /** @type {string[]} */
  const queue = [nodeId];

  while (queue.length) {
    const current = queue.shift();
    const currentDepth = depthByNode.get(current) ?? 0;
    for (const pipe of pipes) {
      if (pipe.target !== current) continue;
      edgeIds.add(pipe.id);
      const feeder = pipe.source;
      const nextDepth = currentDepth + 1;
      if (!depthByNode.has(feeder) || nextDepth < depthByNode.get(feeder)) {
        depthByNode.set(feeder, nextDepth);
        queue.push(feeder);
      }
      if (nextDepth >= minDepth) {
        nodeIds.add(feeder);
      }
    }
  }

  return { nodeIds, edgeIds };
}

/**
 * @typedef {{ nodeId: string, label: string }} ArchitectureFeedStep
 * @typedef {{ pipeId: string, pipeLabel: string, steps: ArchitectureFeedStep[] }} ArchitectureFeedPath
 * @typedef {{ input: import('./architectureGraphSchema.js').ArchitectureIO, paths: ArchitectureFeedPath[] }} ArchitectureInputFeedSequence
 */

/**
 * Longest upstream chain ending at nodeId (pipe direction source → target).
 * @param {string} nodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 * @param {(id: string) => import('./architectureGraphSchema.js').ArchitectureNodeDef | undefined} getNodeById
 * @returns {ArchitectureFeedStep[]}
 */
function getLongestUpstreamChain(nodeId, pipes, getNodeById) {
  const incoming = pipes.filter((pipe) => pipe.target === nodeId);
  const node = getNodeById(nodeId);
  const selfStep = { nodeId, label: node?.label ?? nodeId };

  if (incoming.length === 0) return [selfStep];

  let best = [];
  for (const pipe of incoming) {
    const chain = getLongestUpstreamChain(pipe.source, pipes, getNodeById);
    if (chain.length > best.length) best = chain;
  }
  return [...best, selfStep];
}

/**
 * Upstream feed paths for each declared input on a node (one path per incoming pipe).
 * @param {string | null | undefined} nodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 * @param {(id: string) => import('./architectureGraphSchema.js').ArchitectureNodeDef | undefined} getNodeById
 * @returns {ArchitectureInputFeedSequence[]}
 */
export function getArchitectureInputFeedSequences(nodeId, pipes, getNodeById) {
  if (!nodeId) return [];
  const node = getNodeById(nodeId);
  if (!node?.inputs?.length) return [];

  const incomingPipes = pipes.filter((pipe) => pipe.target === nodeId);
  const targetNode = getNodeById(nodeId);
  const targetStep = { nodeId, label: targetNode?.label ?? nodeId };

  const paths = incomingPipes.map((pipe) => {
    const feederChain = getLongestUpstreamChain(pipe.source, pipes, getNodeById);
    return {
      pipeId: pipe.id,
      pipeLabel: pipe.pipeLabel,
      steps: [...feederChain, targetStep],
    };
  });

  return node.inputs.map((input) => ({
    input,
    paths,
  }));
}

/**
 * System overview selection: focus node (current) + touched neighbors (path).
 * @param {string | null | undefined} selectedNodeId
 * @param {import('./architectureGraphSchema.js').ArchitecturePipeDef[]} pipes
 * @param {{ extendedFeedIn?: boolean }} [options]
 */
export function getOverviewHighlight(selectedNodeId, pipes, { extendedFeedIn = false } = {}) {
  const empty = {
    currentNodeIds: new Set(),
    currentEdgeIds: new Set(),
    pathNodeIds: new Set(),
    pathEdgeIds: new Set(),
  };
  if (!selectedNodeId) return empty;
  const neighborhood = getArchitectureNeighborhood(selectedNodeId, pipes);
  const pathNodeIds = new Set(neighborhood.nodeIds);
  const pathEdgeIds = new Set(neighborhood.edgeIds);

  if (extendedFeedIn) {
    const secondaryFeed = getArchitectureUpstreamFeed(selectedNodeId, pipes, { minDepth: 2 });
    for (const id of secondaryFeed.nodeIds) pathNodeIds.add(id);
    for (const id of secondaryFeed.edgeIds) pathEdgeIds.add(id);
  }

  return {
    currentNodeIds: new Set([selectedNodeId]),
    currentEdgeIds: new Set(),
    pathNodeIds,
    pathEdgeIds,
  };
}

export { LAYER_LABELS, LAYER_ORDER };
