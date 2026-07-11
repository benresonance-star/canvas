import { sha256HexFromString } from './hashFile.js';
import { ingestArtifacts } from '../primitivesApi.js';

export function pinnedVersionForCard(card) {
  return card?.versions?.find((v) => v.version === card.pinnedVersion) || card?.versions?.[0] || null;
}

export function isBimViewerSessionCard(card, pinned = null) {
  const ver = pinned ?? pinnedVersionForCard(card);
  return ver?.bim?.viewerKind === 'ifc-viewer-session' || card?.prefix === 'bim-viewers';
}

export function stableBimViewerIdentity(card, pinned) {
  const sessionId = pinned?.bim?.session?.id ?? card?.id ?? '';
  return `bim-viewer-session:${card?.key ?? ''}:${sessionId}`;
}

export async function stableBimViewerContentHash(card, pinned) {
  return sha256HexFromString(stableBimViewerIdentity(card, pinned));
}

export function bimViewerArtifactPayload(card, pinned) {
  return JSON.stringify({
    viewerKind: 'ifc-viewer-session',
    cardKey: card.key,
    name: card.name,
    session: pinned?.bim?.session ?? {},
  });
}

/**
 * Register a canvas-native IFC Viewer session as a linkable primitives artifact.
 */
export async function registerBimViewerSessionArtifact({
  projectId,
  projectName: _projectName,
  card,
  pinned,
}) {
  if (!projectId || !card || !pinned) {
    return { ok: false, reason: 'invalid_input' };
  }
  try {
    const content_hash = await stableBimViewerContentHash(card, pinned);
    const payload_text = bimViewerArtifactPayload(card, pinned);
    const result = await ingestArtifacts(projectId, {
      files: [{
        type: 'bim_model',
        uri: `canvas-bim-viewer:${projectId}/${card.id}`,
        project_id: projectId,
        title: card.name ?? 'IFC Viewer',
        content_hash,
        version: String(pinned.version ?? 1),
        retrieved_at: pinned.createdAt ?? new Date().toISOString(),
        payload_text,
        metadata: {
          canvas_kind: 'bim-viewer-session',
          file_kind: 'ifc-viewer',
          viewerKind: 'ifc-viewer-session',
          cardKey: card.key,
          prefix: card.prefix ?? 'bim-viewers',
          name: card.name,
          filename: pinned.filename ?? null,
          project_id: projectId,
        },
      }],
      relationships: [],
    });
    const row = result.artifacts?.[0];
    if (!row?.artifactRef?.id) {
      return { ok: false, reason: 'ingest_failed' };
    }
    return {
      ok: true,
      artifactRef: row.artifactRef,
      content_hash: row.content_hash ?? content_hash,
      clusterId: result.clusterId ?? null,
    };
  } catch {
    return { ok: false, reason: 'ingest_failed' };
  }
}
