import {
  normalizeBookmarkUrl,
  bookmarkContentHash,
  domainFromUrl,
  syntheticBookmarkFilename,
  bookmarkCardKeyFromUrl,
} from '../bookmarkUrl.js';
import { parseFilename } from '../filename.js';
import { previewCacheKey, putPreview } from '../previewStore.js';
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
}) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) {
    throw new Error('Invalid URL');
  }

  const bookmarkPreview = buildBookmarkPreviewState(preview, normalizedUrl);
  const displayName = titleOverride?.trim() || bookmarkPreview.title || bookmarkPreview.domain;
  const contentHash = await bookmarkContentHash(normalizedUrl);
  const domain = bookmarkPreview.domain;
  const filename = syntheticBookmarkFilename(domain, 1);
  const parsed = parseFilename(filename);
  const cardKey = bookmarkCardKeyFromUrl(normalizedUrl);
  const fetchedAt = bookmarkPreview.fetchedAt;

  const available = await isApiAvailable();
  let artifactRef = null;
  let effectiveClusterId = clusterId;

  if (available) {
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
          filename,
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
  }

  const previewCacheKeyForCard = await cacheBookmarkThumbnail(
    projectId,
    cardKey,
    parsed.version,
    bookmarkPreview.imageUrl,
  );

  const version = {
    ...parsed,
    filename,
    cardKey,
    cardType: 'bookmark',
    externalUrl: normalizedUrl,
    bookmarkPreview,
    artifactRef,
    content_hash: contentHash,
    lastModified: Date.now(),
    ...(previewCacheKeyForCard ? { previewCacheKey: previewCacheKeyForCard } : {}),
  };

  return {
    ingest: {
      ok: available,
      reason: available ? undefined : 'api_unavailable',
      clusterId: effectiveClusterId,
    },
    filename,
    parsed,
    artifactRef,
    card: {
      id: crypto.randomUUID(),
      key: cardKey,
      prefix: 'links',
      name: displayName,
      type: 'bookmark',
      versions: [version],
      pinnedVersion: parsed.version,
    },
  };
}
