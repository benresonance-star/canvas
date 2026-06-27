import { flowNodeDisplayTitle, flowPreviewArtifactNodeLabel } from './flowDocument.js';
import {
  flowLocalNodeHeaderUsesDarkText,
  normalizeFlowLocalNodeTypeColors,
  resolveFlowLocalNodeTypeColor,
} from './flowLocalNodeTypeColors.js';
import {
  FLOW_LOCAL_NODE_TYPE_ARTIFACT,
  flowLocalNodeTypeMeta,
  normalizeFlowLocalNodeType,
} from './flowLocalNodeTypes.js';

/**
 * @param {object | null | undefined} node
 */
export function flowPreviewNodeTypeId(node) {
  if (node?.type === 'artifact') return FLOW_LOCAL_NODE_TYPE_ARTIFACT;
  return normalizeFlowLocalNodeType(node?.localNodeType);
}

/**
 * @param {object | null | undefined} preview
 */
export function flowPreviewColors(preview) {
  return normalizeFlowLocalNodeTypeColors(preview?.localNodeTypeColors);
}

/**
 * @param {object | null | undefined} node
 * @param {Record<string, string>} colors
 */
export function flowPreviewNodePresentation(node, colors) {
  const typeId = flowPreviewNodeTypeId(node);
  const meta = flowLocalNodeTypeMeta(typeId);
  const headerColor = resolveFlowLocalNodeTypeColor(colors, typeId);
  const darkText = flowLocalNodeHeaderUsesDarkText(headerColor);

  return {
    typeId,
    typeLabel: meta.label.toUpperCase(),
    headerColor,
    titleColor: darkText ? 'var(--color-primary)' : '#ffffff',
    typeColor: darkText ? 'var(--color-muted)' : 'rgba(255,255,255,0.75)',
  };
}

/**
 * @param {object | null | undefined} node
 * @param {Map<string, object> | null | undefined} cardsById
 */
export function flowPreviewNodeTitle(node, cardsById = null) {
  if (node?.type === 'artifact') {
    return flowPreviewArtifactNodeLabel(node, cardsById);
  }
  return flowNodeDisplayTitle({ data: { title: node?.title } });
}
