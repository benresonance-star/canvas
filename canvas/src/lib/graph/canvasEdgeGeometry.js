/** Cubic edge: horizontal tangents at endpoints via midpoint x. */
export function edgePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

/** Point on the same cubic at t = 0.5. */
export function edgeMidpoint(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const t = 0.5;
  const mt = 1 - t;
  const x =
    mt ** 3 * x1 +
    3 * mt ** 2 * t * mx +
    3 * mt * t ** 2 * mx +
    t ** 3 * x2;
  const y =
    mt ** 3 * y1 +
    3 * mt ** 2 * t * y1 +
    3 * mt * t ** 2 * y2 +
    t ** 3 * y2;
  return { x, y };
}

export function isDeletableCanvasEdge(edge) {
  if (!edge || edge.id === '__drag__') return false;
  return edge.kind === 'relationship' || edge.kind === 'note_attachment';
}
