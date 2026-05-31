import { readFileEntry } from './readFile.js';
import { isApiAvailable } from './primitivesApi.js';
import { ingestFoundFiles } from './ingest/syncIngest.js';

/**
 * Resolve or create a primitives artifact ref for a canvas card's pinned version.
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   card: object,
 * }} params
 * @returns {Promise<
 *   | { ok: true, artifactRef: object, version: object }
 *   | { ok: false, reason: 'no_version' | 'not_synced' | 'api_unavailable' | 'ingest_failed' }
 * >}
 */
export async function ensureCardArtifactRef({
  projectId,
  projectName,
  folderHandle,
  card,
}) {
  const pinned =
    card.versions?.find((v) => v.version === card.pinnedVersion) || card.versions?.[0];
  if (!pinned) {
    return { ok: false, reason: 'no_version' };
  }
  if (pinned.artifactRef?.id) {
    return { ok: true, artifactRef: pinned.artifactRef, version: pinned };
  }

  if (!projectId || !folderHandle || !pinned.filename) {
    return { ok: false, reason: 'not_synced' };
  }

  const apiOk = await isApiAvailable();
  if (!apiOk) {
    return { ok: false, reason: 'api_unavailable' };
  }

  try {
    const entry = await folderHandle.getFileHandle(pinned.filename);
    const file = await readFileEntry(entry, {
      cacheKey: pinned.previewCacheKey ?? undefined,
    });
    const flat = [
      {
        ...file,
        ...pinned,
        cardKey: card.key,
        cardType: card.type,
        filename: pinned.filename,
      },
    ];
    const ingest = await ingestFoundFiles(
      projectId,
      projectName || 'Project',
      flat,
      {},
    );
    const ing = ingest.byFilename?.[pinned.filename];
    if (!ing?.artifactRef?.id) {
      return {
        ok: false,
        reason: ingest.reason === 'api_unavailable' ? 'api_unavailable' : 'ingest_failed',
      };
    }
    return {
      ok: true,
      artifactRef: ing.artifactRef,
      version: {
        ...pinned,
        ...file,
        artifactRef: ing.artifactRef,
        content_hash: ing.content_hash ?? file.content_hash,
      },
    };
  } catch {
    return { ok: false, reason: 'not_synced' };
  }
}
