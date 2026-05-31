import { domainFromUrl, normalizeBookmarkUrl } from './bookmarkUrl.js';

const API_BASE = import.meta.env.VITE_PRIMITIVES_API || '/api';

/**
 * Minimal preview when the API is down or fetch fails (user can still add the link).
 * @param {string} url
 */
export function buildFallbackBookmarkPreview(url) {
  const normalized = normalizeBookmarkUrl(url) || url;
  const domain = domainFromUrl(normalized) || normalized;
  return {
    ok: false,
    url: normalized,
    domain,
    title: domain,
    description: null,
    imageUrl: null,
    siteName: domain,
    faviconUrl: null,
  };
}

/**
 * @param {string} url
 * @returns {Promise<{
 *   ok: boolean,
 *   url?: string,
 *   domain?: string,
 *   title?: string,
 *   description?: string | null,
 *   imageUrl?: string | null,
 *   siteName?: string | null,
 *   faviconUrl?: string | null,
 *   error?: string,
 * }>}
 */
export async function fetchBookmarkPreview(url) {
  try {
    const res = await fetch(`${API_BASE}/bookmarks/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fallback = buildFallbackBookmarkPreview(url);
      const gateway = res.status === 502 || res.status === 503;
      return {
        ...fallback,
        error: gateway
          ? 'API server is not running. Start Docker and run npm run server in the canvas folder.'
          : (data.error || res.statusText || 'Preview failed'),
      };
    }
    return data;
  } catch (e) {
    const fallback = buildFallbackBookmarkPreview(url);
    return {
      ...fallback,
      error: e.message || 'Preview failed',
    };
  }
}
