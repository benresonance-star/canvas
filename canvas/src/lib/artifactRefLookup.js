import { folderRelativePathFromVersion } from './filename.js';
import { listProjectArtifacts } from './primitivesApi.js';

function artifactContentHash(artifact) {
  return artifact?.content_hash ?? artifact?.contentHash ?? null;
}

/**
 * @param {object} artifact
 * @param {object} card
 * @param {object} pinned
 */
export function matchArtifactRowToCard(artifact, card, pinned) {
  const meta = artifact?.metadata ?? {};
  const cardKey = card?.key;
  const contentHash = pinned?.content_hash;
  const relativePath = folderRelativePathFromVersion(pinned);
  const filename = pinned?.filename;
  const rowHash = artifactContentHash(artifact);

  if (contentHash && rowHash && contentHash === rowHash) return true;
  if (cardKey && meta.cardKey === cardKey) return true;
  if (relativePath && meta.relativePath === relativePath) return true;
  if (filename && meta.filename === filename) return true;
  if (
    card?.prefix === 'bim-viewers'
    && (meta.canvas_kind === 'bim-viewer-session' || meta.viewerKind === 'ifc-viewer-session')
  ) {
    return true;
  }
  if (
    card?.name
    && (artifact.title === card.name || meta.name === card.name)
    && meta.canvas_kind
    && card?.type
    && (meta.canvas_kind === card.type || meta.canvas_kind.replace(/-/g, '_') === card.type.replace(/-/g, '_'))
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve an existing primitives artifact ref from the project catalog.
 * @param {string} projectId
 * @param {object} card
 * @param {object} pinned
 */
export async function lookupArtifactRefForCard(projectId, card, pinned) {
  if (!projectId || !card || !pinned) return null;
  try {
    const { artifacts } = await listProjectArtifacts(projectId, { limit: 250 });
    const row = (artifacts || []).find((artifact) => matchArtifactRowToCard(artifact, card, pinned));
    if (!row?.id) return null;
    return {
      artifactRef: { id: row.id, type: 'artifact' },
      content_hash: artifactContentHash(row) ?? pinned.content_hash ?? null,
    };
  } catch {
    return null;
  }
}
