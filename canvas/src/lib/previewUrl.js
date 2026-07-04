export function isBlobUrl(url) {
  return typeof url === 'string' && url.startsWith('blob:');
}

/**
 * Blob preview URLs are session-only. Drop them when a durable cache key exists
 * so loaders rehydrate from IndexedDB instead of fetching dead blob: URLs.
 */
export function stripEphemeralPreviewUrls(version) {
  if (!version || typeof version !== 'object') return version;
  if (!version.previewCacheKey || !isBlobUrl(version.objectUrl)) return version;
  const { objectUrl, ...rest } = version;
  return {
    ...rest,
    inline: false,
    previewStripped: true,
  };
}

export function previewNeedsRehydrate(version) {
  if (!version?.previewCacheKey) return false;
  if (isBlobUrl(version.objectUrl)) return true;
  if (version.previewStripped) return true;
  if (!version.objectUrl && !version.dataUrl) return true;
  return false;
}
