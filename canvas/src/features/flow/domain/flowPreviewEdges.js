import { getSmoothStepPath, Position } from '@xyflow/react';
import { flowPreviewNodeRect } from './flowPreviewLayout.js';

/**
 * @param {object} node
 * @param {import('@xyflow/react').Position} position
 */
export function flowPreviewNodeAnchor(node, position) {
  const rect = flowPreviewNodeRect(node);
  switch (position) {
    case Position.Left:
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case Position.Right:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y };
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    default:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
}

/**
 * @param {object} source
 * @param {object} target
 */
export function flowPreviewEdgePositions(source, target) {
  const sourceRect = flowPreviewNodeRect(source);
  const targetRect = flowPreviewNodeRect(target);
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourcePosition: Position.Right, targetPosition: Position.Left };
    }
    return { sourcePosition: Position.Left, targetPosition: Position.Right };
  }

  if (dy >= 0) {
    return { sourcePosition: Position.Bottom, targetPosition: Position.Top };
  }
  return { sourcePosition: Position.Top, targetPosition: Position.Bottom };
}

/**
 * @param {object} source
 * @param {object} target
 */
export function buildFlowPreviewEdgePath(source, target) {
  const { sourcePosition, targetPosition } = flowPreviewEdgePositions(source, target);
  const sourceAnchor = flowPreviewNodeAnchor(source, sourcePosition);
  const targetAnchor = flowPreviewNodeAnchor(target, targetPosition);
  const [path] = getSmoothStepPath({
    sourceX: sourceAnchor.x,
    sourceY: sourceAnchor.y,
    sourcePosition,
    targetX: targetAnchor.x,
    targetY: targetAnchor.y,
    targetPosition,
  });
  return path;
}
