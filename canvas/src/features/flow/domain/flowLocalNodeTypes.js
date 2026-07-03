import {
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  Zap,
} from 'lucide-react';

export const FLOW_LOCAL_NODE_TYPE_ARTIFACT = 'artifact';
export const FLOW_LOCAL_NODE_TYPE_ACTION = 'action';
export const FLOW_LOCAL_NODE_TYPE_DECISION = 'decision';
export const FLOW_LOCAL_NODE_TYPE_CHILD_STUDIO = 'child_studio';

/** @deprecated Stored as `step` in older documents; migrates to decision. */
export const FLOW_LOCAL_NODE_TYPE_STEP = 'step';

/** @typedef {'artifact' | 'action' | 'decision' | 'external_resource'} FlowLocalNodeTypeId */

/** @type {ReadonlySet<string>} */
export const LEGACY_FLOW_LOCAL_NODE_TYPE_IDS = new Set([
  'general',
  'human',
  'agent',
  'agent_skill',
  'agent_rules',
  'tool',
  'step',
]);

/** @type {ReadonlyArray<{ id: FlowLocalNodeTypeId, label: string, icon: import('react').ComponentType<{ size?: number, className?: string, strokeWidth?: number }>, defaultTitle: string, iconClassName: string }>} */
export const FLOW_LOCAL_NODE_TYPES = Object.freeze([
  {
    id: 'artifact',
    label: 'Artifact',
    icon: FileText,
    defaultTitle: 'Artifact',
    iconClassName: 'text-accent',
  },
  {
    id: 'action',
    label: 'Action',
    icon: Zap,
    defaultTitle: 'Action',
    iconClassName: 'text-secondary',
  },
  {
    id: 'decision',
    label: 'Evaluation',
    icon: GitBranch,
    defaultTitle: 'Evaluation',
    iconClassName: 'text-secondary',
  },
  {
    id: 'external_resource',
    label: 'External resource',
    icon: ExternalLink,
    defaultTitle: 'External resource',
    iconClassName: 'text-secondary',
  },
]);

/** Color keys for exploration nodes, including non-creatable artifact variants. */
export const FLOW_NODE_COLOR_TYPES = Object.freeze([
  ...FLOW_LOCAL_NODE_TYPES,
  {
    id: FLOW_LOCAL_NODE_TYPE_CHILD_STUDIO,
    label: 'Child Studio',
    icon: Network,
    defaultTitle: 'Child Studio',
    iconClassName: 'text-secondary',
  },
]);

const FLOW_LOCAL_NODE_TYPE_IDS = new Set(FLOW_LOCAL_NODE_TYPES.map((entry) => entry.id));
const FLOW_NODE_COLOR_TYPE_IDS = new Set(FLOW_NODE_COLOR_TYPES.map((entry) => entry.id));

/**
 * Maps legacy/unknown node types to Artifact; migrates retired `step` to Evaluation.
 * @param {unknown} value
 * @returns {FlowLocalNodeTypeId}
 */
export function normalizeFlowLocalNodeType(value) {
  if (value === FLOW_LOCAL_NODE_TYPE_STEP) {
    return FLOW_LOCAL_NODE_TYPE_DECISION;
  }
  if (typeof value === 'string' && FLOW_LOCAL_NODE_TYPE_IDS.has(value)) {
    return /** @type {FlowLocalNodeTypeId} */ (value);
  }
  if (typeof value === 'string' && LEGACY_FLOW_LOCAL_NODE_TYPE_IDS.has(value)) {
    return FLOW_LOCAL_NODE_TYPE_ARTIFACT;
  }
  return FLOW_LOCAL_NODE_TYPE_ARTIFACT;
}

/**
 * @param {unknown} value
 */
export function flowLocalNodeTypeMeta(value) {
  const typeId = normalizeFlowLocalNodeType(value);
  return FLOW_LOCAL_NODE_TYPES.find((entry) => entry.id === typeId)
    ?? FLOW_LOCAL_NODE_TYPES[0];
}

/**
 * @param {unknown} value
 */
export function flowNodeColorTypeMeta(value) {
  if (typeof value === 'string' && FLOW_NODE_COLOR_TYPE_IDS.has(value)) {
    return FLOW_NODE_COLOR_TYPES.find((entry) => entry.id === value)
      ?? FLOW_LOCAL_NODE_TYPES[0];
  }
  return flowLocalNodeTypeMeta(value);
}

/**
 * Default type for newly created local steps (quick-add).
 * @param {unknown} [requestedType]
 * @returns {FlowLocalNodeTypeId}
 */
export function resolveNewFlowLocalNodeType(requestedType) {
  if (typeof requestedType === 'string' && requestedType.trim()) {
    return normalizeFlowLocalNodeType(requestedType);
  }
  return FLOW_LOCAL_NODE_TYPE_DECISION;
}
