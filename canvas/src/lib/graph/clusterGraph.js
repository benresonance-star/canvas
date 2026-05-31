import { fetchClusterGraph as apiFetchGraph } from '../primitivesApi.js';
import { getCardPixelSize } from '../cards.js';

export { fetchClusterGraph } from '../primitivesApi.js';

/** Map artifact id → canvas card + center point */
export function buildArtifactToCardMap(cards) {
  const map = new Map();
  for (const card of cards) {
    const pinned =
      card.versions?.find((v) => v.version === card.pinnedVersion) || card.versions?.[0];
    const ref = pinned?.artifactRef;
    if (ref?.id && ref.type === 'artifact') {
      const { w, h } = getCardPixelSize(card);
      map.set(ref.id, {
        cardId: card.id,
        cardKey: card.key,
        name: card.name,
        x: card.x + w / 2,
        y: card.y + h / 2,
        w,
        h,
      });
    }
  }
  return map;
}

/** Edges drawable on canvas (artifact endpoints only for relationships; note→artifact for attachments) */
export function resolveGraphToCards(graph, cards) {
  const artifactMap = buildArtifactToCardMap(cards);
  const nodeById = new Map((graph?.nodes || []).map((n) => [n.id, n]));

  const canvasEdges = [];

  for (const edge of graph?.edges || []) {
    if (edge.kind === 'note_attachment') {
      const to = artifactMap.get(edge.toId);
      if (!to) continue;
      canvasEdges.push({
        ...edge,
        noteId: edge.fromId,
        toCardId: to.cardId,
        toX: to.x,
        toY: to.y,
        fromX: to.x - 40,
        fromY: to.y - 40,
        dashed: true,
        noteOnly: true,
      });
      continue;
    }

    const fromArt = edge.fromType === 'artifact' ? artifactMap.get(edge.fromId) : null;
    const toArt = edge.toType === 'artifact' ? artifactMap.get(edge.toId) : null;
    if (!fromArt && !toArt) continue;
    if (!fromArt || !toArt) continue;

    canvasEdges.push({
      ...edge,
      fromCardId: fromArt.cardId,
      toCardId: toArt.cardId,
      fromX: fromArt.x,
      fromY: fromArt.y,
      toX: toArt.x,
      toY: toArt.y,
      dashed: false,
    });
  }

  const linkCountByCardId = new Map();
  for (const e of canvasEdges) {
    if (e.fromCardId) {
      linkCountByCardId.set(e.fromCardId, (linkCountByCardId.get(e.fromCardId) || 0) + 1);
    }
    if (e.toCardId) {
      linkCountByCardId.set(e.toCardId, (linkCountByCardId.get(e.toCardId) || 0) + 1);
    }
  }

  return {
    canvasEdges,
    artifactMap,
    nodeById,
    linkCountByCardId,
  };
}

export async function loadCanvasGraph(clusterId, cards) {
  if (!clusterId) {
    return resolveGraphToCards({ nodes: [], edges: [] }, cards);
  }
  const graph = await apiFetchGraph(clusterId);
  return { graph, ...resolveGraphToCards(graph, cards) };
}
