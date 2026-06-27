import { flowArtifactNodeDisplayTitle, flowNodeDisplayTitle } from './flowDocument.js';
import { orderPathStepIdsByFlowSequence } from './flowPaths.js';
import { resolvePathStepRunState } from './flowStepRunState.js';

/**
 * @param {object | null | undefined} node
 * @param {Map<string, object> | null | undefined} cardsById
 */
export function pathStepDisplayTitle(node, cardsById = null) {
  if (!node) return '';
  if (node.type === 'artifact') {
    return flowArtifactNodeDisplayTitle(node.data, cardsById?.get(node.data?.cardId));
  }
  return flowNodeDisplayTitle(node);
}

/**
 * @param {object | null | undefined} path
 * @param {object[]} edges
 * @param {Map<string, object> | Record<string, object> | null | undefined} nodesById
 */
export function resolvePathCurrentActiveStepIdInSequence(path, edges = [], nodesById = null) {
  const ordered = orderPathStepIdsByFlowSequence(path?.stepIds ?? [], edges, nodesById);
  return ordered.find((stepId) => resolvePathStepRunState(path, stepId) === 'current') ?? null;
}

/**
 * @param {object | null | undefined} path
 * @param {object[]} edges
 * @param {Map<string, object> | Record<string, object> | null | undefined} nodesById
 * @param {Map<string, object> | null | undefined} cardsById
 */
export function resolvePathCurrentActiveStepTitle(path, edges = [], nodesById = null, cardsById = null) {
  const stepId = resolvePathCurrentActiveStepIdInSequence(path, edges, nodesById);
  if (!stepId) return null;
  const node = nodesById instanceof Map ? nodesById.get(stepId) : nodesById?.[stepId];
  if (!node) return null;
  return pathStepDisplayTitle(node, cardsById);
}
