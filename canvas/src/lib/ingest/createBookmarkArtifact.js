import {
  normalizeBookmarkUrl,
  bookmarkContentHash,
  domainFromUrl,
  syntheticBookmarkFilename,
  bookmarkCardKeyFromUrl,
} from '../bookmarkUrl.js';
import { parseFilename } from '../filename.js';
import { previewCacheKey, putPreview } from '../previewStore.js';
import { writeBookmarkFile } from '../folderWrite.js';
import { enqueueArtifactSyncRetry } from '../artifactSyncOutbox.js';
import {
  ingestArtifacts,
  ensureClusterForProject,
  isApiAvailable,
} from '../primitivesApi.js';
import { createLinksFromSource } from './linkIngest.js';

/**
 * @param {string | null | undefined} imageUrl
 */
async function cacheBookmarkThumbnail(projectId, cardKey, version, imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const key = previewCacheKey(projectId, cardKey, version);
    await putPreview(key, blob);
    return key;
  } catch {
    return null;
  }
}

/**
 * @param {object} preview
 * @param {string} normalizedUrl
 */
export function buildBookmarkPreviewState(preview, normalizedUrl) {
  const domain = preview.domain || domainFromUrl(normalizedUrl);
  const fetchedAt = new Date().toISOString();
  return {
    title: preview.title || domain,
    description: preview.description ?? null,
    imageUrl: preview.imageUrl ?? null,
    siteName: preview.siteName || domain,
    faviconUrl: preview.faviconUrl ?? null,
    domain,
    fetchedAt,
  };
}

export async function createBookmarkArtifact({
  projectId,
  projectName,
  url,
  preview,
  titleOverride = '',
  linkTargetRefs = [],
  clusterId = null,
  folderHandle = null,
}) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) {
    throw new Error('Invalid URL');
  }

  const bookmarkPreview = buildBookmarkPreviewState(preview, normalizedUrl);
  const displayName = titleOverride?.trim() || bookmarkPreview.title || bookmarkPreview.domain;
  const contentHash = await bookmarkContentHash(normalizedUrl);
  const domain = bookmarkPreview.domain;
  const cardId = crypto.randomUUID();
  const filename = syntheticBookmarkFilename(domain, 1, cardId);
  const parsed = parseFilename(filename);
  const cardKey = bookmarkCardKeyFromUrl(normalizedUrl, cardId);
  const fetchedAt = bookmarkPreview.fetchedAt;
  let folderFilename = filename;

  if (folderHandle) {
    folderFilename = await writeBookmarkFile(folderHandle, {
      filename,
      url: normalizedUrl,
      title: displayName,
    });
  }

  const available = await isApiAvailable();
  let artifactRef = null;
  let effectiveClusterId = clusterId;
  let ingestOk = available;
  let ingestReason = available ? undefined : 'api_unavailable';

  if (available) {
    try {
      const cluster = await ensureClusterForProject(projectId, projectName);
      effectiveClusterId = cluster.id;
      const ingestRes = await ingestArtifacts(projectId, {
        files: [{
          type: 'other',
          uri: normalizedUrl,
          content_hash: contentHash,
          version: '1',
          retrieved_at: fetchedAt,
          payload_text: null,
          metadata: {
            canvas_kind: 'bookmark',
            external_url: normalizedUrl,
            title: displayName,
            description: bookmarkPreview.description,
            site_name: bookmarkPreview.siteName,
            image_url: bookmarkPreview.imageUrl,
            favicon_url: bookmarkPreview.faviconUrl,
            fetched_at: fetchedAt,
            filename: folderFilename,
            cardKey,
          },
        }],
        relationships: [],
      });
      const row = ingestRes.artifacts?.[0];
      artifactRef = row?.artifactRef ?? null;
      effectiveClusterId = ingestRes.clusterId || effectiveClusterId;

      if (artifactRef && effectiveClusterId && linkTargetRefs.length > 0) {
        await createLinksFromSource(effectiveClusterId, artifactRef, linkTargetRefs);
      }
      ingestOk = Boolean(artifactRef);
      ingestReason = artifactRef ? undefined : 'ingest_failed';
    } catch (e) {
      ingestOk = false;
      ingestReason = e?.message ?? 'ingest_failed';
    }
  }

  if (!artifactRef) {
    enqueueArtifactSyncRetry({
      kind: 'bookmark',
      projectId,
      projectName,
      cardKey,
      filename: folderFilename,
      url: normalizedUrl,
      title: displayName,
      description: bookmarkPreview.description,
      siteName: bookmarkPreview.siteName,
      imageUrl: bookmarkPreview.imageUrl,
      faviconUrl: bookmarkPreview.faviconUrl,
      fetchedAt,
      retrievedAt: fetchedAt,
      contentHash,
      linkTargetRefs,
      lastError: ingestReason,
    });
  }

  const previewCacheKeyForCard = await cacheBookmarkThumbnail(
    projectId,
    cardKey,
    parsed.version,
    bookmarkPreview.imageUrl,
  );

  const version = {
    ...parsed,
    filename: folderFilename,
    cardKey,
    cardType: 'bookmark',
    externalUrl: normalizedUrl,
    bookmarkPreview,
    artifactRef,
    artifactSyncState: artifactRef ? 'synced' : 'pending',
    content_hash: contentHash,
    lastModified: Date.now(),
    ...(previewCacheKeyForCard ? { previewCacheKey: previewCacheKeyForCard } : {}),
  };

  return {
    ingest: {
      ok: ingestOk,
      reason: ingestReason,
      clusterId: effectiveClusterId,
    },
    filename: folderFilename,
    parsed,
    artifactRef,
    card: {
      id: cardId,
      key: cardKey,
      prefix: 'links',
      name: displayName,
      type: 'bookmark',
      versions: [version],
      pinnedVersion: parsed.version,
    },
  };
}
