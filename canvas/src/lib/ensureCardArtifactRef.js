import { readFileEntry } from './readFile.js';
import { isApiAvailable } from './primitivesApi.js';
import { ingestFoundFiles, lookupIngestByFilename } from './ingest/syncIngest.js';
import { folderRelativePathFromVersion } from './filename.js';
import { getFileHandleAtPath } from './folderWrite.js';
import { flushArtifactSyncOutbox } from './artifactSyncOutbox.js';
import { processArtifactSyncRetryEntry } from './artifactSyncRetry.js';
import { lookupArtifactRefForCard } from './artifactRefLookup.js';
import {
  isBimViewerSessionCard,
  registerBimViewerSessionArtifact,
} from './ingest/bimViewerArtifact.js';

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

  if (!projectId) {
    return { ok: false, reason: 'not_synced' };
  }

  const apiOk = await isApiAvailable();
  if (!apiOk) {
    return { ok: false, reason: 'api_unavailable' };
  }

  await flushArtifactSyncOutbox(async (entry) => {
    if (entry.projectId !== projectId || entry.cardKey !== card.key) {
      return { ok: false };
    }
    return processArtifactSyncRetryEntry(entry);
  }, { projectId });

  const catalogHit = await lookupArtifactRefForCard(projectId, card, pinned);
  if (catalogHit?.artifactRef?.id) {
    return {
      ok: true,
      artifactRef: catalogHit.artifactRef,
      version: {
        ...pinned,
        artifactRef: catalogHit.artifactRef,
        content_hash: catalogHit.content_hash ?? pinned.content_hash,
        artifactSyncState: 'synced',
      },
    };
  }

  if (isBimViewerSessionCard(card, pinned)) {
    const registered = await registerBimViewerSessionArtifact({
      projectId,
      projectName,
      card,
      pinned,
    });
    if (registered.ok) {
      return {
        ok: true,
        artifactRef: registered.artifactRef,
        version: {
          ...pinned,
          artifactRef: registered.artifactRef,
          content_hash: registered.content_hash ?? pinned.content_hash,
          artifactSyncState: 'synced',
        },
      };
    }
    return { ok: false, reason: registered.reason ?? 'ingest_failed' };
  }

  if (!folderHandle || !pinned.filename) {
    return { ok: false, reason: 'not_synced' };
  }

  try {
    const relativePath = folderRelativePathFromVersion(pinned);
    const entry = await getFileHandleAtPath(folderHandle, relativePath);
    const file = await readFileEntry(entry, {
      cacheKey: pinned.previewCacheKey ?? undefined,
      relativePath,
    });
    const flat = [
      {
        ...file,
        ...pinned,
        cardKey: card.key,
        cardType: card.type,
        filename: pinned.filename,
        relativePath,
      },
    ];
    const ingest = await ingestFoundFiles(
      projectId,
      projectName || 'Project',
      flat,
      {},
    );
    const ing = lookupIngestByFilename(ingest.byFilename, {
      filename: pinned.filename,
      relativePath,
    });
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
