import { newArtifactFlowNode, normalizeFlowEdgeForEditor } from './flowDocument.js';

export function studioCardLikeFromOverview(overview) {
  const studio = overview?.studio;
  if (!studio?.id) return null;
  return {
    id: `studio-node-${studio.id}`,
    name: studio.title || 'Studio',
    type: 'studio',
    studioId: studio.id,
    studioKind: studio.studioKind,
    studioState: studio.state,
    parentStudioId: studio.parentStudioId ?? null,
    versions: [{
      version: 1,
      artifactRef: { id: studio.id, type: 'artifact' },
      studioId: studio.id,
      inline: true,
      ext: 'studio',
      filename: studio.title || 'Studio',
    }],
    pinnedVersion: 1,
  };
}

export function studioArtifactIdFromCard(card) {
  const pinned = (card?.versions ?? []).find((version) => version.version === card?.pinnedVersion)
    ?? card?.versions?.[0];
  return card?.studioId ?? pinned?.studioId ?? pinned?.artifactRef?.id ?? null;
}

export function flowNodeStudioArtifactId(node) {
  return node?.artifactId ?? node?.data?.artifactId ?? null;
}

export function findStudioNodeForCard(nodes, childCard) {
  const childArtifactId = studioArtifactIdFromCard(childCard);
  if (!childArtifactId) return null;
  return (nodes ?? []).find((node) => flowNodeStudioArtifactId(node) === childArtifactId) ?? null;
}

export function childStudioNodePosition(sourceNode, fallbackPosition = { x: 80, y: 80 }) {
  if (!sourceNode?.position) return fallbackPosition;
  const sourceWidth = Number(sourceNode.measured?.width ?? sourceNode.width ?? sourceNode.style?.width ?? 0);
  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 300;
  return {
    x: sourceNode.position.x + safeWidth + 220,
    y: sourceNode.position.y + 40,
  };
}

export function buildChildStudioNode(childCard, position) {
  const node = newArtifactFlowNode(childCard, position);
  if (!node) return null;
  return {
    ...node,
    data: {
      ...node.data,
      title: childCard?.name || node.data?.title || 'Studio',
      artifactType: 'studio',
      description: childCard?.parentStudioId ? 'Child Studio' : 'Studio',
      displayFilename: childCard?.name || node.data?.displayFilename || 'Studio',
      artifactExt: '',
    },
  };
}

export function buildChildStudioEdge(sourceId, childNodeId) {
  if (!sourceId || !childNodeId || sourceId === childNodeId) return null;
  return normalizeFlowEdgeForEditor({
    id: crypto.randomUUID(),
    source: sourceId,
    target: childNodeId,
    type: 'smoothstep',
    data: {
      connectionTypeId: 'custom',
      connectionTypeCustom: 'Invokes',
      properties: {},
    },
  });
}
