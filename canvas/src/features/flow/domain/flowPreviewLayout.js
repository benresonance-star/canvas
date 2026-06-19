/**
 * @param {object} node
 */
export function flowPreviewNodeRect(node) {
  return {
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    width: Number(node.width) || 0,
    height: Number(node.height) || 0,
  };
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} a
 * @param {{ x: number, y: number, width: number, height: number }} b
 * @param {number} [gap]
 */
export function flowPreviewRectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/**
 * @param {object[]} nodes
 * @param {{ gap?: number, maxIterations?: number }} [options]
 */
export function resolveFlowPreviewOverlaps(nodes, { gap = 16, maxIterations = 50 } = {}) {
  if (!nodes?.length) return [];

  const layout = nodes.map((node) => ({ ...node, ...flowPreviewNodeRect(node) }));

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let moved = false;

    for (let i = 0; i < layout.length; i += 1) {
      for (let j = i + 1; j < layout.length; j += 1) {
        const a = layout[i];
        const b = layout[j];
        if (!flowPreviewRectsOverlap(a, b, gap)) continue;

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        if (overlapX <= overlapY) {
          const push = (overlapX + gap) / 2;
          const aCenter = a.x + a.width / 2;
          const bCenter = b.x + b.width / 2;
          if (aCenter <= bCenter) {
            a.x -= push;
            b.x += push;
          } else {
            a.x += push;
            b.x -= push;
          }
        } else {
          const push = (overlapY + gap) / 2;
          const aCenter = a.y + a.height / 2;
          const bCenter = b.y + b.height / 2;
          if (aCenter <= bCenter) {
            a.y -= push;
            b.y += push;
          } else {
            a.y += push;
            b.y -= push;
          }
        }

        moved = true;
      }
    }

    if (!moved) break;
  }

  return layout;
}
