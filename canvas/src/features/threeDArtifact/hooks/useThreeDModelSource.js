import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';
import { detectThreeDFormat, isSupportedThreeDFormat } from '../utils/fileFormat.js';
import {
  assessThreeDPreviewFeasibility,
  canAutoLoadThreeDSource,
  canRequestFolderLoad,
} from '../utils/previewFeasibility.js';

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

export async function resolveThreeDSourceUrl({
  version,
  folderHandle,
  format,
  loadFromFolder = false,
}) {
  let nextSourceUrl = version?.objectUrl || version?.dataUrl || null;
  /** @type {string[]} */
  const ephemeralUrls = [];

  if (!nextSourceUrl && version?.previewCacheKey) {
    const blob = await getPreview(version.previewCacheKey);
    if (blob) {
      nextSourceUrl = URL.createObjectURL(blob);
      ephemeralUrls.push(nextSourceUrl);
    }
  }

  if (
    !nextSourceUrl
    && loadFromFolder
    && folderHandle
    && version?.relativePath
  ) {
    const blob = await blobFromFolderPath(folderHandle, version.relativePath);
    nextSourceUrl = URL.createObjectURL(blob);
    ephemeralUrls.push(nextSourceUrl);
  }

  if (
    nextSourceUrl
    && format === 'gltf'
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

  return { sourceUrl: nextSourceUrl, ephemeralUrls };
}

export function useThreeDModelSource(version, { folderHandle = null, folderLinked = null } = {}) {
  const linked = folderLinked ?? Boolean(folderHandle);
  const feasibility = useMemo(
    () => assessThreeDPreviewFeasibility(version, { folderLinked: linked }),
    [linked, version],
  );
  const sourceInfo = resolveThreeDSourceInfo(version);
  const [sourceUrl, setSourceUrl] = useState(version?.objectUrl || version?.dataUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [folderLoadRequested, setFolderLoadRequested] = useState(false);
  const ephemeralUrlsRef = useRef([]);

  useEffect(() => () => {
    ephemeralUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    ephemeralUrlsRef.current = [];
  }, []);

  const loadSource = useCallback(async ({ fromFolder = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveThreeDSourceUrl({
        version,
        folderHandle,
        format: sourceInfo.format,
        loadFromFolder: fromFolder,
      });
      ephemeralUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      ephemeralUrlsRef.current = resolved.ephemeralUrls;
      setSourceUrl(resolved.sourceUrl);
      return resolved.sourceUrl;
    } catch (e) {
      setSourceUrl(null);
      setError(e?.message || 'Could not prepare model source');
      return null;
    } finally {
      setLoading(false);
    }
  }, [folderHandle, sourceInfo.format, version]);

  useEffect(() => {
    if (!canAutoLoadThreeDSource(feasibility.mode)) {
      setSourceUrl(version?.objectUrl || version?.dataUrl || null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    /** @type {string[]} */
    let ephemeralUrls = [];

    async function autoLoad() {
      setLoading(true);
      setError(null);
      try {
        const resolved = await resolveThreeDSourceUrl({
          version,
          folderHandle,
          format: sourceInfo.format,
          loadFromFolder: false,
        });
        if (cancelled) {
          resolved.ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        ephemeralUrls = resolved.ephemeralUrls;
        ephemeralUrlsRef.current = ephemeralUrls;
        setSourceUrl(resolved.sourceUrl);
      } catch (e) {
        if (!cancelled) {
          setSourceUrl(null);
          setError(e?.message || 'Could not prepare model source');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void autoLoad();
    return () => {
      cancelled = true;
      ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    feasibility.mode,
    folderHandle,
    sourceInfo.format,
    version?.dataUrl,
    version?.objectUrl,
    version?.previewCacheKey,
    version?.relativePath,
  ]);

  const requestFolderLoad = useCallback(async () => {
    if (!canRequestFolderLoad(feasibility.mode)) return null;
    setFolderLoadRequested(true);
    return loadSource({ fromFolder: true });
  }, [feasibility.mode, loadSource]);

  return {
    ...sourceInfo,
    sourceUrl,
    loading,
    error,
    feasibility,
    folderLoadRequested,
    requestFolderLoad,
  };
}
