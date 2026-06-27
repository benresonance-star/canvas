import { MarkerType } from '@xyflow/react';
import { getCardPixelSize } from '../../../lib/cards.js';
import { cardDisplayFilename, cardFileExtension, pinnedCardVersion } from '../../../lib/filename.js';
import {
  FLOW_CONNECTION_CUSTOM_TYPE_ID,
  flowEdgeCondition,
  flowEdgeConnectionTypeCustom,
  flowEdgeConnectionTypeId,
  isKnownFlowConnectionTypeId,
  normalizeFlowConnectionTypeId,
  normalizeFlowEdgeCondition,
  resolveFlowEdgeConnectionTypeFields,
  resolveFlowConnectionLabel,
  validateFlowEdgeCondition,
} from './flowConnectionTypes.js';
import { flowLocalNodeTypeMeta, FLOW_LOCAL_NODE_TYPE_ARTIFACT, normalizeFlowLocalNodeType, resolveNewFlowLocalNodeType } from './flowLocalNodeTypes.js';
import { normalizeFlowLocalNodeTypeColors } from './flowLocalNodeTypeColors.js';
import { normalizeFlowNodeActors } from './flowNodeActors.js';
import { normalizeFlowPaths } from './flowPaths.js';

export const EMPTY_FLOW_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 });
export const UNTITLED_EXPLORATION_TITLE = 'Untitled exploration';
export const UNTITLED_FLOW_STEP_TITLE = 'Untitled step';
export const FLOW_EDGE_TYPE = 'smoothstep';
export const FLOW_EDGE_MAX_PROPERTIES = 32;
export const FLOW_EDGE_PROPERTY_KEY_MAX = 64;
export const FLOW_EDGE_PROPERTY_VALUE_MAX = 500;
export const FLOW_EDGE_CUSTOM_LABEL_MAX = 200;
export const FLOW_EDGE_DIRECTION = Object.freeze({
  forward: 'forward',
  reverse: 'reverse',
});

const LOCAL_FLOW_NODE_PREVIEW_SIZE = Object.freeze({ w: 300, h: 200 });

/**
 * @param {object} node
 * @param {object | null | undefined} [card]
 */
export function defaultFlowNodePreviewSize(node, card = null) {
  if (node?.type === 'artifact' && card) {
    const { w, h } = getCardPixelSize(card);
    return { width: w, height: h };
  }
  return { width: LOCAL_FLOW_NODE_PREVIEW_SIZE.w, height: LOCAL_FLOW_NODE_PREVIEW_SIZE.h };
}

/**
 * Collapsed flow nodes should hug their header; fixed dimensions are only for expanded previews.
 * @param {object} node
 */
export function stripFlowNodeDimensions(node) {
  const next = {
    ...node,
    style: { ...(node.style ?? {}) },
  };
  delete next.width;
  delete next.height;
  delete next.measured;
  delete next.style.width;
  delete next.style.height;
  return next;
}

/**
 * @param {object} node
 */
function normalizeFlowNodeDataFields(node) {
  let next = node;
  /** @type {Record<string, unknown>} */
  const dataPatch = {};

  if (node.type === 'local') {
    const migratedType = normalizeFlowLocalNodeType(node.data?.localNodeType);
    if (node.data?.localNodeType !== migratedType) {
      dataPatch.localNodeType = migratedType;
    }
  }

  const normalizedActors = normalizeFlowNodeActors(node.data?.actors);
  const currentActors = Array.isArray(node.data?.actors) ? node.data.actors : [];
  if (JSON.stringify(normalizedActors) !== JSON.stringify(currentActors)) {
    dataPatch.actors = normalizedActors;
  }

  if (Object.keys(dataPatch).length) {
    next = patchFlowNodePresentation(node, dataPatch);
  }
  return next;
}

/**
 * @param {object} node
 */
function serializeFlowNodeData(node) {
  const base = { ...(node.data ?? {}) };
  const actors = normalizeFlowNodeActors(base.actors);
  if (node.type === 'local') {
    return {
      ...base,
      localNodeType: normalizeFlowLocalNodeType(base.localNodeType),
      actors,
    };
  }
  return {
    ...base,
    actors,
  };
}

/**
 * @param {object} node
 * @param {object | null | undefined} [card]
 */
export function normalizeFlowNodeForEditor(node, card = null) {
  if (!node) return node;
  let next = normalizeFlowNodeDataFields(node);
  if (next.data?.showContent !== true) {
    const width = next.width ?? next.style?.width ?? null;
    const height = next.height ?? next.style?.height ?? null;
    if (width || height || next.measured) {
      return stripFlowNodeDimensions(next);
    }
    return next;
  }
  const width = next.width ?? next.style?.width ?? null;
  const height = next.height ?? next.style?.height ?? null;
  if (!width || !height) {
    return patchFlowNodePresentation(next, {}, defaultFlowNodePreviewSize(next, card));
  }
  return patchFlowNodePresentation(next, {}, { width, height });
}

/**
 * @param {object} node
 * @param {Record<string, unknown>} dataPatch
 * @param {{ width?: number, height?: number } | null | undefined} [sizePatch]
 */
export function patchFlowNodePresentation(node, dataPatch, sizePatch) {
  const next = {
    ...node,
    data: { ...(node.data ?? {}), ...dataPatch },
    style: { ...(node.style ?? {}) },
  };
  if (sizePatch?.width != null) {
    next.width = sizePatch.width;
    next.style.width = sizePatch.width;
  }
  if (sizePatch?.height != null) {
    next.height = sizePatch.height;
    next.style.height = sizePatch.height;
  }
  return next;
}

export function newLocalFlowNode(position, values = {}) {
  const localNodeType = resolveNewFlowLocalNodeType(values.localNodeType);
  const meta = flowLocalNodeTypeMeta(localNodeType);
  return {
    id: crypto.randomUUID(),
    type: 'local',
    position,
    data: {
      localNodeType,
      title: values.title || meta.defaultTitle,
      description: values.description || '',
      actors: normalizeFlowNodeActors(values.actors),
    },
  };
}

export function newArtifactFlowNode(card, position) {
  const pinned = card?.versions?.find((version) => version.version === card.pinnedVersion)
    ?? card?.versions?.[0];
  const artifactId = pinned?.artifactRef?.id;
  if (!artifactId) return null;
  return {
    id: crypto.randomUUID(),
    type: 'artifact',
    artifactId,
    position,
    data: {
      title: card.name || 'Artifact',
      description: card.type || '',
      artifactId,
      cardId: card.id,
      artifactType: card.type,
      displayFilename: cardDisplayFilename(card) || card.name || 'Artifact',
      artifactExt: cardFileExtension(card) || '',
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function normalizeFlowEdgeProperties(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw)
    .filter(([key, value]) => typeof key === 'string' && key.trim() && typeof value === 'string')
    .map(([key, value]) => [key.trim().slice(0, FLOW_EDGE_PROPERTY_KEY_MAX), value.trim().slice(0, FLOW_EDGE_PROPERTY_VALUE_MAX)])
    .filter(([, value]) => value.length > 0)
    .slice(0, FLOW_EDGE_MAX_PROPERTIES);
  return Object.fromEntries(entries);
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeProperties(edge) {
  return normalizeFlowEdgeProperties(edge?.data?.properties);
}

/**
 * @param {object} edge
 */
export function normalizeFlowEdgeMetadata(edge) {
  const { connectionTypeId, connectionTypeCustom: rawCustom, condition } = resolveFlowEdgeConnectionTypeFields(edge);
  const normalizedTypeId = normalizeFlowConnectionTypeId(connectionTypeId);
  const typeAllowsCustom = normalizedTypeId === FLOW_CONNECTION_CUSTOM_TYPE_ID;
  const connectionTypeCustom = typeAllowsCustom
    ? String(rawCustom ?? '').trim().slice(0, FLOW_EDGE_CUSTOM_LABEL_MAX)
    : '';
  const normalizedCondition = normalizeFlowEdgeCondition(condition);
  const properties = normalizeFlowEdgeProperties(edge?.data?.properties);
  const data = {
    ...(edge.data ?? {}),
    connectionTypeId: normalizedTypeId,
    connectionTypeCustom,
    properties,
  };
  if (normalizedCondition) {
    data.condition = normalizedCondition;
  } else {
    delete data.condition;
  }
  const normalized = {
    ...edge,
    data,
    label: resolveFlowConnectionLabel({ ...edge, data }),
  };
  return normalized;
}

/**
 * @param {object} edge
 * @param {{ connectionTypeId?: string, connectionTypeCustom?: string, condition?: object | null, properties?: Record<string, string> }} patch
 */
export function patchFlowEdge(edge, patch) {
  const currentTypeId = flowEdgeConnectionTypeId(edge);
  const nextTypeId = patch.connectionTypeId !== undefined
    ? normalizeFlowConnectionTypeId(String(patch.connectionTypeId ?? '').trim())
    : currentTypeId;
  const nextCustom = patch.connectionTypeCustom !== undefined
    ? String(patch.connectionTypeCustom ?? '').trim().slice(0, FLOW_EDGE_CUSTOM_LABEL_MAX)
    : (patch.connectionTypeId !== undefined && !nextTypeId
      ? ''
      : flowEdgeConnectionTypeCustom(edge));
  let nextCondition = patch.condition !== undefined
    ? normalizeFlowEdgeCondition(patch.condition)
    : flowEdgeCondition(edge);
  if (patch.connectionTypeId !== undefined && !nextTypeId) {
    nextCondition = null;
  }
  const nextProperties = patch.properties !== undefined
    ? normalizeFlowEdgeProperties(patch.properties)
    : flowEdgeProperties(edge);
  const data = {
    ...(edge.data ?? {}),
    connectionTypeId: nextTypeId,
    connectionTypeCustom: nextTypeId === FLOW_CONNECTION_CUSTOM_TYPE_ID ? nextCustom : '',
    properties: nextProperties,
  };
  if (nextCondition) {
    data.condition = nextCondition;
  } else {
    delete data.condition;
  }
  return {
    ...edge,
    data,
    label: resolveFlowConnectionLabel({ ...edge, data }),
  };
}

/**
 * @param {object} edge
 * @throws {Error}
 */
export function validateFlowEdgeMetadata(edge) {
  validateFlowEdgeCondition(edge?.data?.condition);
  const typeId = normalizeFlowConnectionTypeId(edge?.data?.connectionTypeId);
  if (!isKnownFlowConnectionTypeId(typeId)) {
    throw new Error(`invalid flow edge connection type: ${typeId}`);
  }
  if (typeId === FLOW_CONNECTION_CUSTOM_TYPE_ID) {
    const custom = typeof edge?.data?.connectionTypeCustom === 'string'
      ? edge.data.connectionTypeCustom.trim()
      : '';
    if (!custom) {
      throw new Error('custom flow edge connection requires connectionTypeCustom');
    }
    if (custom.length > FLOW_EDGE_CUSTOM_LABEL_MAX) {
      throw new Error('custom flow edge label is too long');
    }
  }
  const properties = edge?.data?.properties;
  if (properties != null && (typeof properties !== 'object' || Array.isArray(properties))) {
    throw new Error('flow edge properties must be an object');
  }
  const normalized = normalizeFlowEdgeProperties(properties);
  if (properties != null && Object.keys(properties).length !== Object.keys(normalized).length) {
    throw new Error('flow edge properties must be string key-value pairs');
  }
}

function serializeFlowEdgeForSave(edge) {
  const normalized = normalizeFlowEdgeMetadata(edge);
  const {
    properties,
    connectionTypeId,
    connectionTypeCustom,
    condition,
    ...presentationRest
  } = normalized.data ?? {};
  const data = {
    ...presentationRest,
    connectionTypeId,
    connectionTypeCustom,
    properties: flowEdgeProperties(normalized),
    edgeType: normalized.type ?? normalized.data?.edgeType ?? FLOW_EDGE_TYPE,
  };
  if (condition) {
    data.condition = condition;
  }
  return {
    id: normalized.id,
    source: normalized.source,
    target: normalized.target,
    sourceHandle: normalized.sourceHandle ?? null,
    targetHandle: normalized.targetHandle ?? null,
    label: normalized.label ?? '',
    data,
  };
}

export function snapshotForSave(flow, nodes, edges, viewport, paths = []) {
  const nodeIds = (nodes ?? []).map((node) => node.id);
  return {
    expectedRevision: flow.revision,
    title: flow.title.trim() || UNTITLED_EXPLORATION_TITLE,
    description: flow.description || '',
    viewport: viewport || EMPTY_FLOW_VIEWPORT,
    snapshotPath: flow.snapshotPath || null,
    localNodeTypeColors: normalizeFlowLocalNodeTypeColors(flow.localNodeTypeColors),
    paths: normalizeFlowPaths(paths, nodeIds),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      artifactId: node.type === 'artifact' ? (node.artifactId || node.data?.artifactId) : null,
      position: node.position,
      width: node.data?.showContent === true ? node.width : null,
      height: node.data?.showContent === true ? node.height : null,
      data: serializeFlowNodeData(node),
    })),
    edges: edges.map((edge) => serializeFlowEdgeForSave(edge)),
  };
}

function previewEdgeMetadata(edge) {
  const normalized = normalizeFlowEdgeMetadata(edge);
  const condition = flowEdgeCondition(normalized);
  return {
    label: normalized.label ?? '',
    connectionTypeId: flowEdgeConnectionTypeId(normalized),
    connectionTypeCustom: flowEdgeConnectionTypeCustom(normalized),
    ...(condition ? { condition } : {}),
    properties: flowEdgeProperties(normalized),
  };
}

export function previewFromFlow(nodes, edges, meta = {}) {
  return {
    description: typeof meta.description === 'string' ? meta.description.trim() : '',
    localNodeTypeColors: normalizeFlowLocalNodeTypeColors(meta.localNodeTypeColors),
    nodes: (nodes ?? []).map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      type: node.type,
      title: flowNodeDisplayTitle(node),
      localNodeType: node.type === 'local'
        ? normalizeFlowLocalNodeType(node.data?.localNodeType)
        : FLOW_LOCAL_NODE_TYPE_ARTIFACT,
      ...(node.type === 'artifact'
        ? {
            displayFilename: flowNodePreviewFilename(node),
            cardId: node.data?.cardId ?? null,
            artifactId: node.artifactId ?? node.data?.artifactId ?? null,
            artifactExt: node.data?.artifactExt ?? null,
          }
        : {}),
    })),
    edges: (edges ?? []).map((edge) => ({
      source: edge.source,
      target: edge.target,
      flowing: flowEdgeIsFlowing(edge),
      direction: flowEdgeDirection(edge),
      ...previewEdgeMetadata(edge),
    })),
  };
}

/**
 * @param {object[]} edges
 * @param {string | string[]} edgeIds
 */
export function removeFlowEdgesById(edges, edgeIds) {
  const ids = new Set(Array.isArray(edgeIds) ? edgeIds : [edgeIds]);
  return (edges ?? []).filter((edge) => !ids.has(edge.id));
}

/**
 * @param {object[]} nodes
 * @param {object[]} edges
 * @param {string | string[]} nodeIds
 */
export function removeFlowNodesById(nodes, edges, nodeIds) {
  const ids = new Set(Array.isArray(nodeIds) ? nodeIds : [nodeIds]);
  return {
    nodes: (nodes ?? []).filter((node) => !ids.has(node.id)),
    edges: (edges ?? []).filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
  };
}

/**
 * @param {object | null | undefined} node
 */
export function flowNodeDisplayTitle(node) {
  const title = node?.data?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : UNTITLED_FLOW_STEP_TITLE;
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeDirection(edge) {
  const direction = edge?.data?.flowDirection;
  if (direction === FLOW_EDGE_DIRECTION.reverse) return FLOW_EDGE_DIRECTION.reverse;
  return FLOW_EDGE_DIRECTION.forward;
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeEffectiveEndpoints(edge) {
  if (!edge) return { from: null, to: null };
  if (flowEdgeDirection(edge) === FLOW_EDGE_DIRECTION.reverse) {
    return { from: edge.target, to: edge.source };
  }
  return { from: edge.source, to: edge.target };
}

/**
 * @param {object | null | undefined} edge
 * @param {Map<string, object> | Record<string, object> | null | undefined} nodesById
 */
export function flowEdgeEndpointTitles(edge, nodesById) {
  const { from, to } = flowEdgeEffectiveEndpoints(edge);
  const resolve = (nodeId) => {
    if (!nodeId) return 'Unknown';
    const node = nodesById instanceof Map ? nodesById.get(nodeId) : nodesById?.[nodeId];
    return flowNodeDisplayTitle(node);
  };
  return { fromTitle: resolve(from), toTitle: resolve(to) };
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeIsFlowing(edge) {
  if (!edge) return false;
  if (typeof edge.data?.flowing === 'boolean') return edge.data.flowing;
  return edge.animated === true;
}

/**
 * @param {object | null | undefined} edge
 */
export function normalizeFlowEdgeForEditor(edge) {
  if (!edge) return edge;
  const normalized = normalizeFlowEdgeMetadata(edge);
  const flowing = flowEdgeIsFlowing(normalized);
  const reversed = flowEdgeDirection(normalized) === FLOW_EDGE_DIRECTION.reverse;
  const arrowMarker = { type: MarkerType.ArrowClosed };
  const resolvedLabel = resolveFlowConnectionLabel(normalized);
  return {
    ...normalized,
    type: FLOW_EDGE_TYPE,
    label: resolvedLabel || undefined,
    animated: flowing,
    markerEnd: reversed ? undefined : arrowMarker,
    markerStart: reversed ? arrowMarker : undefined,
    className: reversed ? 'flow-edge-reverse' : undefined,
  };
}

/**
 * @param {Iterable<string>} nodeIds
 * @param {object[]} edges
 */
export function expandFlowNodeNetwork(nodeIds, edges) {
  const seeds = [...nodeIds].filter(Boolean);
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
        if (!neighbor || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

/**
 * @param {object[]} nodes
 * @param {object[]} edges
 * @param {Iterable<string>} nodeIds
 */
export function filterFlowSubgraph(nodes, edges, nodeIds) {
  const ids = nodeIds instanceof Set ? nodeIds : new Set(nodeIds);
  const subgraphNodes = (nodes ?? []).filter((node) => ids.has(node.id));
  const subgraphEdges = (edges ?? []).filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );
  return { nodes: subgraphNodes, edges: subgraphEdges };
}

/**
 * @param {object[]} nodes
 * @param {Iterable<string>} nodeIds
 */
export function artifactCardIdsFromFlowNodes(nodes, nodeIds) {
  const ids = nodeIds instanceof Set ? nodeIds : new Set(nodeIds);
  const cardIds = new Set();
  for (const node of nodes ?? []) {
    if (!ids.has(node.id) || node.type !== 'artifact') continue;
    const cardId = node.data?.cardId;
    if (cardId) cardIds.add(cardId);
  }
  return [...cardIds];
}

function flowNodesByIdMap(nodes) {
  return new Map((nodes ?? []).map((node) => [node.id, node]));
}

function formatFlowEdgePropertiesSuffix(edge) {
  const properties = flowEdgeProperties(edge);
  const pairs = Object.entries(properties);
  if (!pairs.length) return '';
  return ` ${pairs.map(([key, value]) => `${key}=${value}`).join(', ')}`;
}

function formatFlowConnectionLine(edge, nodesById) {
  const { fromTitle, toTitle } = flowEdgeEndpointTitles(edge, nodesById);
  const typeLabel = resolveFlowConnectionLabel(edge);
  const typeSuffix = typeLabel ? ` [${typeLabel}]` : '';
  const propertySuffix = formatFlowEdgePropertiesSuffix(edge);
  const flags = [];
  if (flowEdgeIsFlowing(edge)) flags.push('animated');
  if (flowEdgeDirection(edge) === FLOW_EDGE_DIRECTION.reverse) flags.push('reversed');
  const flagSuffix = flags.length ? ` (${flags.join(', ')})` : '';
  return `- ${fromTitle} → ${toTitle}${typeSuffix}${propertySuffix}${flagSuffix}`;
}

/**
 * @param {{ title?: string, description?: string }} meta
 * @param {object[]} nodes
 * @param {object[]} edges
 */
export function formatFlowDiagramForAgent(meta, nodes, edges) {
  const title = typeof meta?.title === 'string' && meta.title.trim()
    ? meta.title.trim()
    : UNTITLED_EXPLORATION_TITLE;
  const description = typeof meta?.description === 'string' ? meta.description.trim() : '';
  const nodesById = flowNodesByIdMap(nodes);
  const lines = [`# Exploration: ${title}`];
  if (description) {
    lines.push('', description);
  }
  lines.push('', '## Nodes');
  if (!nodes?.length) {
    lines.push('- (empty)');
  } else {
    for (const node of nodes) {
      const label = flowNodeDisplayTitle(node);
      const kind = node.type === 'artifact' ? 'artifact' : 'local';
      lines.push(`- ${label} (${kind})`);
    }
  }
  lines.push('', '## Connections');
  if (!edges?.length) {
    lines.push('- (none)');
  } else {
    for (const edge of edges) {
      lines.push(formatFlowConnectionLine(edge, nodesById));
    }
  }
  return lines.join('\n');
}

/**
 * @param {{ title?: string, description?: string }} meta
 * @param {object[]} nodes
 * @param {object[]} edges
 */
export function formatFlowSubgraphForAgent(meta, nodes, edges) {
  const title = typeof meta?.title === 'string' && meta.title.trim()
    ? meta.title.trim()
    : UNTITLED_EXPLORATION_TITLE;
  const lines = [`# Exploration selection: ${title}`, '', '## Selected nodes'];
  if (!nodes?.length) {
    lines.push('- (none)');
  } else {
    for (const node of nodes) {
      const label = flowNodeDisplayTitle(node);
      const kind = node.type === 'artifact' ? 'artifact' : 'local';
      lines.push(`- ${label} (${kind})`);
    }
  }
  lines.push('', '## Connections in selection');
  const nodesById = flowNodesByIdMap(nodes);
  if (!edges?.length) {
    lines.push('- (none)');
  } else {
    for (const edge of edges) {
      lines.push(formatFlowConnectionLine(edge, nodesById));
    }
  }
  return lines.join('\n');
}

/**
 * @param {object | null | undefined} node
 */
export function flowNodePreviewFilename(node) {
  if (node?.type !== 'artifact') return null;
  const fromData = node.data?.displayFilename?.trim();
  if (fromData) return fromData;
  const title = flowNodeDisplayTitle(node);
  const ext = node.data?.artifactExt?.trim();
  if (!ext) return title;
  const suffix = `.${ext}`;
  return title.toLowerCase().endsWith(suffix) ? title : `${title}${suffix}`;
}

/**
 * Display title for artifact flow nodes in the editor (name + extension when known).
 *
 * @param {object | null | undefined} data
 * @param {object | null | undefined} [card]
 */
export function flowArtifactNodeDisplayTitle(data, card = null) {
  if (card) {
    const fromCard = cardDisplayFilename(card);
    if (fromCard) return fromCard;
  }
  if (data?.displayFilename?.trim()) return data.displayFilename.trim();
  return flowNodePreviewFilename({ type: 'artifact', data: data ?? {} })
    ?? flowNodeDisplayTitle({ data: data ?? {} });
}

/**
 * @param {object | null | undefined} node
 * @param {Map<string, object> | null | undefined} [cardsById]
 */
export function findCardForFlowPreviewNode(node, cardsById = null) {
  if (!cardsById || node?.type !== 'artifact') return null;
  if (node.cardId) {
    const byId = cardsById.get(node.cardId);
    if (byId) return byId;
  }
  const artifactId = node.artifactId;
  if (!artifactId) return null;
  for (const card of cardsById.values()) {
    const pinned = pinnedCardVersion(card);
    if (pinned?.artifactRef?.id === artifactId) return card;
  }
  return null;
}

/**
 * Label for nodes in embedded flow previews on the main canvas.
 *
 * @param {object | null | undefined} node
 * @param {Map<string, object> | null | undefined} [cardsById]
 */
export function flowPreviewArtifactNodeLabel(node, cardsById = null) {
  if (node?.type !== 'artifact') {
    return flowNodeDisplayTitle({ data: { title: node?.title } });
  }
  const card = findCardForFlowPreviewNode(node, cardsById);
  return flowArtifactNodeDisplayTitle({
    title: node.title,
    displayFilename: node.displayFilename,
    artifactExt: node.artifactExt,
  }, card);
}

export function flowGraphFromPreview(preview) {
  return {
    nodes: (preview?.nodes ?? []).map((node) => ({
      id: node.id,
      type: node.type,
      data: {
        title: node.title,
        cardId: node.cardId ?? null,
        displayFilename: node.displayFilename ?? null,
      },
      position: { x: node.x, y: node.y },
    })),
    edges: (preview?.edges ?? []).map((edge, index) => {
      const connectionTypeId = normalizeFlowConnectionTypeId(edge.connectionTypeId);
      const connectionTypeCustom = typeof edge.connectionTypeCustom === 'string' ? edge.connectionTypeCustom : '';
      const label = typeof edge.label === 'string' ? edge.label : '';
      const condition = normalizeFlowEdgeCondition(edge.condition);
      const data = {
        flowing: edge.flowing,
        flowDirection: edge.direction ?? FLOW_EDGE_DIRECTION.forward,
        connectionTypeId,
        connectionTypeCustom,
        properties: normalizeFlowEdgeProperties(edge.properties),
      };
      if (condition) {
        data.condition = condition;
      }
      return {
        id: `${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        label,
        data,
      };
    }),
  };
}

/**
 * @param {object[]} nodes
 * @param {object[]} edges
 */
export function exportFlowRelationships(nodes, edges) {
  return (edges ?? []).map((edge) => {
    const normalized = normalizeFlowEdgeMetadata(edge);
    const { from, to } = flowEdgeEffectiveEndpoints(normalized);
    const connectionTypeId = flowEdgeConnectionTypeId(normalized);
    return {
      id: normalized.id,
      fromNodeId: from,
      toNodeId: to,
      connectionTypeId,
      label: resolveFlowConnectionLabel(normalized),
      detail: flowEdgeConnectionTypeCustom(normalized),
      customLabel: connectionTypeId === FLOW_CONNECTION_CUSTOM_TYPE_ID
        ? flowEdgeConnectionTypeCustom(normalized)
        : '',
      properties: flowEdgeProperties(normalized),
      direction: flowEdgeDirection(normalized),
    };
  });
}

export function flowCardFromDocument(flow, position = { x: 100, y: 100 }) {
  return {
    id: crypto.randomUUID(),
    key: `flows__${flow.id}`,
    prefix: 'flows',
    name: flow.title,
    type: 'flow',
    x: position.x,
    y: position.y,
    versions: [{
      version: 1,
      artifactRef: { id: flow.id, type: 'artifact' },
      flowId: flow.id,
      inline: true,
      ext: 'flow',
      filename: flow.snapshotPath || `${flow.title}.flow.json`,
      flowPreview: previewFromFlow(flow.nodes ?? [], flow.edges ?? [], {
        description: flow.description,
        localNodeTypeColors: flow.localNodeTypeColors,
      }),
    }],
    pinnedVersion: 1,
  };
}

export function patchFlowCard(card, flow, nodes, edges) {
  return {
    name: flow.title,
    versions: (card.versions ?? []).map((version) =>
      version.version === card.pinnedVersion
        ? {
            ...version,
            flowId: flow.id,
            filename: flow.snapshotPath || version.filename,
            flowPreview: previewFromFlow(nodes, edges, {
              description: flow.description,
              localNodeTypeColors: flow.localNodeTypeColors,
            }),
          }
        : version),
  };
}

/**
 * @param {string | null | undefined} message
 * @param {{
 *   saveFailed?: string,
 *   saveFailedNetwork?: string,
 *   artifactNotInProject?: string,
 *   artifactNodeMissingRef?: string,
 *   notFound?: string,
 *   requestFailed?: string,
 *   unavailable?: string,
 * }} copy
 */
function mapFlowUserError(message, copy = {}) {
  if (!message) return null;
  if (/flow not found|exploration not found/i.test(message)) {
    return copy.notFound ?? 'Exploration not found';
  }
  if (/exploration request failed|flow request failed/i.test(message)) {
    return message;
  }
  if (/failed to fetch|network|ECONNREFUSED/i.test(message)) {
    return copy.saveFailedNetwork ?? null;
  }
  if (message.includes('artifact nodes must reference artifacts in the same project')) {
    return copy.artifactNotInProject ?? null;
  }
  if (message.includes('artifact node requires artifactId')) {
    return copy.artifactNodeMissingRef ?? null;
  }
  return null;
}

/**
 * @param {string | null | undefined} message
 * @param {{
 *   saveFailed?: string,
 *   saveFailedNetwork?: string,
 *   artifactNotInProject?: string,
 *   artifactNodeMissingRef?: string,
 *   notFound?: string,
 *   requestFailed?: string,
 *   unavailable?: string,
 * }} copy
 */
export function formatFlowLoadError(message, copy = {}) {
  const mapped = mapFlowUserError(message, copy);
  if (mapped) return mapped;
  return copy.unavailable ?? 'Exploration unavailable';
}

/**
 * @param {string | null | undefined} message
 * @param {{
 *   saveFailed?: string,
 *   saveFailedNetwork?: string,
 *   artifactNotInProject?: string,
 *   artifactNodeMissingRef?: string,
 *   notFound?: string,
 *   requestFailed?: string,
 *   unavailable?: string,
 * }} copy
 */
export function formatFlowSaveError(message, copy = {}) {
  const fallback = copy.saveFailed ?? 'Could not save exploration.';
  const mapped = mapFlowUserError(message, copy);
  if (mapped) return mapped;
  if (!message) return fallback;
  return `${fallback} (${message})`;
}

