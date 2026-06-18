import { clampCardSize } from './cardResize.js';

export function computeDragPosition(draggingCard, clientX, clientY, zoom) {
  if (!draggingCard || !zoom) return null;
  const dx = (clientX - draggingCard.startMouseX) / zoom;
  const dy = (clientY - draggingCard.startMouseY) / zoom;
  return {
    x: draggingCard.startX + dx,
    y: draggingCard.startY + dy,
  };
}

export function computeResizeRect(resizingCard, clientX, clientY, zoom) {
  if (!resizingCard || !zoom) return null;
  const { corner, startMouseX, startMouseY, startX, startY, startW, startH } = resizingCard;
  const dx = (clientX - startMouseX) / zoom;
  const dy = (clientY - startMouseY) / zoom;
  let width;
  let height;
  if (corner === 'se') {
    width = startW + dx;
    height = startH + dy;
  } else if (corner === 'ne') {
    width = startW + dx;
    height = startH - dy;
  } else if (corner === 'sw') {
    width = startW - dx;
    height = startH + dy;
  } else {
    width = startW - dx;
    height = startH - dy;
  }

  ({ width, height } = clampCardSize(width, height));

  let x;
  let y;
  if (corner === 'se') {
    x = startX;
    y = startY;
  } else if (corner === 'ne') {
    x = startX;
    y = startY + startH - height;
  } else if (corner === 'sw') {
    x = startX + startW - width;
    y = startY;
  } else {
    x = startX + startW - width;
    y = startY + startH - height;
  }

  return { x, y, width, height };
}
