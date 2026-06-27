import { getBezierPath, Position } from '@xyflow/react';
import { getCardPixelSize } from '../cards.js';

/** @typedef {{ left: number, top: number, right: number, bottom: number, centerX: number, centerY: number }} CardLinkBounds */

/**
 * @param {object} card
 * @returns {CardLinkBounds}
 */
export function cardLinkBounds(card) {
  const { w, h } = getCardPixelSize(card);
  return {
    left: card.x,
    top: card.y,
    right: card.x + w,
    bottom: card.y + h,
    centerX: card.x + w / 2,
    centerY: card.y + h / 2,
  };
}

/**
 * Pick React Flow handle positions and edge-centered anchor points between two cards.
 * @param {CardLinkBounds} fromCard
 * @param {CardLinkBounds} toCard
 */
export function resolveCardEdgeAnchors(fromCard, toCard) {
  const dx = toCard.centerX - fromCard.centerX;
  const dy = toCard.centerY - fromCard.centerY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        fromX: fromCard.right,
        fromY: fromCard.centerY,
        toX: toCard.left,
        toY: toCard.centerY,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    }
    return {
      fromX: fromCard.left,
      fromY: fromCard.centerY,
      toX: toCard.right,
      toY: toCard.centerY,
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
    };
  }

  if (dy >= 0) {
    return {
      fromX: fromCard.centerX,
      fromY: fromCard.bottom,
      toX: toCard.centerX,
      toY: toCard.top,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  }

  return {
    fromX: fromCard.centerX,
    fromY: fromCard.top,
    toX: toCard.centerX,
    toY: toCard.bottom,
    sourcePosition: Position.Top,
    targetPosition: Position.Bottom,
  };
}

/**
 * Drag wire from the card link handle (right edge); target snaps to the facing edge when hovering.
 * @param {CardLinkBounds} sourceCard
 * @param {CardLinkBounds | null} targetCard
 * @param {{ x: number, y: number }} pointer
 */
export function resolveLinkDragAnchors(sourceCard, targetCard, pointer) {
  const fromX = sourceCard.right;
  const fromY = sourceCard.centerY;
  const sourcePosition = Position.Right;

  if (targetCard) {
    const anchors = resolveCardEdgeAnchors(sourceCard, targetCard);
    return {
      fromX,
      fromY,
      toX: anchors.toX,
      toY: anchors.toY,
      sourcePosition,
      targetPosition: anchors.targetPosition,
    };
  }

  const dx = pointer.x - fromX;
  const dy = pointer.y - fromY;
  let targetPosition = Position.Left;
  if (Math.abs(dx) >= Math.abs(dy)) {
    targetPosition = dx >= 0 ? Position.Left : Position.Right;
  } else {
    targetPosition = dy >= 0 ? Position.Top : Position.Bottom;
  }

  return {
    fromX,
    fromY,
    toX: pointer.x,
    toY: pointer.y,
    sourcePosition,
    targetPosition,
  };
}

export function edgePath(
  x1,
  y1,
  x2,
  y2,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
) {
  const [path] = getBezierPath({
    sourceX: x1,
    sourceY: y1,
    sourcePosition,
    targetX: x2,
    targetY: y2,
    targetPosition,
  });
  return path;
}

export function edgeMidpoint(
  x1,
  y1,
  x2,
  y2,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
) {
  const [, labelX, labelY] = getBezierPath({
    sourceX: x1,
    sourceY: y1,
    sourcePosition,
    targetX: x2,
    targetY: y2,
    targetPosition,
  });
  return { x: labelX, y: labelY };
}

export function isDeletableCanvasEdge(edge) {
  if (!edge || edge.id === '__drag__') return false;
  return edge.kind === 'relationship' || edge.kind === 'note_attachment';
}
