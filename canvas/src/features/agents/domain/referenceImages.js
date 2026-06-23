import { loadImageDataUrlForPinned } from '../../../lib/agentContextContent.js';

export function pinnedVersionForCard(card) {
  return card?.versions?.find((v) => v.version === card.pinnedVersion) ?? card?.versions?.[0] ?? null;
}

export function artifactIdForAgentReferenceCard(card) {
  return pinnedVersionForCard(card)?.artifactRef?.id ?? null;
}

function isImageCard(card, pinned) {
  const ext = String(pinned?.ext || pinned?.filename?.split('.').pop() || '').toLowerCase();
  return card?.type === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
}

/**
 * Resolve selected image references to original image bytes for a single agent execution.
 * These data URLs are transient request payloads; they should not be persisted into project state.
 */
export async function resolveAgentReferenceImages({
  cards = [],
  referenceArtifactIds = [],
  folderHandle = null,
} = {}) {
  const selected = new Set((referenceArtifactIds ?? []).filter(Boolean));
  if (!selected.size) return [];

  const cardsByArtifactId = new Map();
  for (const card of cards) {
    const artifactId = artifactIdForAgentReferenceCard(card);
    if (artifactId && !cardsByArtifactId.has(artifactId)) {
      cardsByArtifactId.set(artifactId, card);
    }
  }

  const resolved = [];
  for (const artifactId of selected) {
    const card = cardsByArtifactId.get(artifactId);
    const pinned = pinnedVersionForCard(card);
    if (!card || !isImageCard(card, pinned)) continue;

    const dataUrl = await loadImageDataUrlForPinned(pinned, folderHandle);
    if (!dataUrl?.startsWith('data:image/')) {
      const name = card.name || pinned?.filename || 'Selected reference';
      throw new Error(`${name} is selected as an image reference, but its source image bytes are unavailable. Reconnect the project folder or rehydrate the image preview, then run the agent again.`);
    }

    resolved.push({
      artifactId,
      dataUrl,
      filename: pinned?.filename ?? card.name ?? null,
    });
  }

  return resolved;
}
