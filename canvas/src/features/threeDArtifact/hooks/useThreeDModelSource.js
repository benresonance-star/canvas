import { useEffect, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';
import { detectThreeDFormat, isSupportedThreeDFormat } from '../utils/fileFormat.js';

/** @type {Map<string, { sourceUrl: string, objectUrls: string[] }>} */
const gltfRewriteCache = new Map();

export function getGltfRewriteCacheKey(version) {
  const relativePath = version?.relativePath ?? version?.filename ?? '';
  const identity = version?.content_hash ?? version?.objectUrl ?? version?.previewCacheKey ?? '';
  return `${relativePath}|${identity}`;
}

export function invalidateThreeDGltfRewriteCache(cacheKey) {
  const entry = gltfRewriteCache.get(cacheKey);
  if (!entry) return;
  entry.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  gltfRewriteCache.delete(cacheKey);
}

export function clearThreeDGltfRewriteCache() {
  for (const entry of gltfRewriteCache.values()) {
    entry.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
  gltfRewriteCache.clear();
}

function dirname(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
}

function resolveRelativeAssetPath(modelRelativePath, uri) {
  const cleanUri = decodeURIComponent(String(uri ?? '').split(/[?#]/)[0]).replace(/\\/g, '/');
  const baseDir = dirname(modelRelativePath);
  const parts = [...baseDir.split('/'), ...cleanUri.split('/')]
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function shouldRewriteGltfUri(uri) {
  const value = String(uri ?? '').trim();
  if (!value) return false;
  return !/^(data:|blob:|https?:|file:)/i.test(value);
}

async function blobFromFolderPath(folderHandle, relativePath) {
  const handle = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await handle.getFile();
  return new Blob([await file.arrayBuffer()], {
    type: file.type || 'application/octet-stream',
  });
}

export async function rewriteGltfDependencies({
  sourceUrl,
  folderHandle,
  relativePath,
}) {
  if (!sourceUrl || !folderHandle || !relativePath) {
    return { sourceUrl, objectUrls: [] };
  }

  const response = await fetch(sourceUrl);
  const json = JSON.parse(await response.text());
  const objectUrls = [];

  async function rewriteEntry(entry) {
    if (!shouldRewriteGltfUri(entry?.uri)) return;
    const assetPath = resolveRelativeAssetPath(relativePath, entry.uri);
    const blob = await blobFromFolderPath(folderHandle, assetPath);
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.push(objectUrl);
    entry.uri = objectUrl;
  }

  await Promise.all([
    ...(json.buffers ?? []).map(rewriteEntry),
    ...(json.images ?? []).map(rewriteEntry),
  ]);

  const rewritten = new Blob([JSON.stringify(json)], { type: 'model/gltf+json' });
  const rewrittenUrl = URL.createObjectURL(rewritten);
  objectUrls.push(rewrittenUrl);
  return { sourceUrl: rewrittenUrl, objectUrls };
}

export function resolveThreeDSourceInfo(version) {
  const filename = version?.filename ?? version?.relativePath ?? '';
  const format = String(version?.ext || detectThreeDFormat(filename) || '').toLowerCase();
  return {
    filename,
    format,
    supported: isSupportedThreeDFormat(format),
    sourceFile: {
      url: version?.objectUrl || version?.dataUrl || null,
      filename,
      format,
      sizeBytes: version?.size ?? 0,
      uploadedAt: version?.lastModified
        ? new Date(version.lastModified).toISOString()
        : new Date().toISOString(),
      contentHash: version?.content_hash,
      relativePath: version?.relativePath ?? null,
    },
  };
}

export function useThreeDModelSource(version, { folderHandle = null } = {}) {
  const [sourceUrl, setSourceUrl] = useState(version?.objectUrl || version?.dataUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sourceInfo = resolveThreeDSourceInfo(version);

  useEffect(() => {
    let cancelled = false;
    /** Preview-only blob URLs — revoked when this viewer unmounts. */
    let ephemeralUrls = [];

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let nextSourceUrl = version?.objectUrl || version?.dataUrl || null;
        if (!nextSourceUrl && version?.previewCacheKey) {
          const blob = await getPreview(version.previewCacheKey);
          if (blob) {
            nextSourceUrl = URL.createObjectURL(blob);
            ephemeralUrls.push(nextSourceUrl);
          }
        }
        if (
          nextSourceUrl
          && sourceInfo.format === 'gltf'
          && folderHandle
          && version?.relativePath
        ) {
          const cacheKey = getGltfRewriteCacheKey(version);
          const cached = gltfRewriteCache.get(cacheKey);
          if (cached?.sourceUrl) {
            nextSourceUrl = cached.sourceUrl;
          } else {
            const rewritten = await rewriteGltfDependencies({
              sourceUrl: nextSourceUrl,
              folderHandle,
              relativePath: version.relativePath,
            });
            gltfRewriteCache.set(cacheKey, {
              sourceUrl: rewritten.sourceUrl,
              objectUrls: rewritten.objectUrls,
            });
            nextSourceUrl = rewritten.sourceUrl;
          }
        }
        if (!cancelled) {
          setSourceUrl(nextSourceUrl);
        }
      } catch (e) {
        if (!cancelled) {
          setSourceUrl(null);
          setError(e?.message || 'Could not prepare GLTF dependencies');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    folderHandle,
    sourceInfo.format,
    version?.dataUrl,
    version?.objectUrl,
    version?.previewCacheKey,
    version?.relativePath,
  ]);

  return {
    ...sourceInfo,
    sourceUrl,
    loading,
    error,
  };
}
