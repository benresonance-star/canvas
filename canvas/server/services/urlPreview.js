import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * @param {string} raw
 * @returns {URL | null}
 */
export function normalizePreviewUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} hostname
 */
export function isBlockedPreviewHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host === '0.0.0.0'
  ) {
    return true;
  }
  if (isIP(host)) {
    if (host === '127.0.0.1' || host === '::1') return true;
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (host.startsWith('169.254.')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
  }
  return false;
}

/**
 * @param {URL} parsed
 */
export function assertPreviewUrlAllowed(parsed) {
  if (isBlockedPreviewHost(parsed.hostname)) {
    throw new Error('Preview not allowed for this host');
  }
}

/**
 * @param {string} html
 * @param {string} prop
 */
function metaContent(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * @param {string} html
 */
export function parseOpenGraphFromHtml(html) {
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title =
    metaContent(html, 'og:title')
    || metaContent(html, 'twitter:title')
    || (titleTag?.[1] ? decodeHtmlEntities(titleTag[1].trim()) : null);
  const description =
    metaContent(html, 'og:description')
    || metaContent(html, 'twitter:description')
    || metaContent(html, 'description');
  const imageUrl =
    metaContent(html, 'og:image')
    || metaContent(html, 'twitter:image')
    || metaContent(html, 'twitter:image:src');
  const siteName = metaContent(html, 'og:site_name');
  return { title, description, imageUrl, siteName };
}

/**
 * @param {string} baseUrl
 * @param {string | null | undefined} imageUrl
 */
export function resolvePreviewImageUrl(baseUrl, imageUrl) {
  if (!imageUrl) return null;
  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * @param {URL} parsed
 * @returns {string | null}
 */
export function youtubeVideoIdFromUrl(parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    return parsed.pathname.split('/').filter(Boolean)[0] || null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      return parts[1] || null;
    }
  }
  return null;
}

/**
 * @param {URL} parsed
 */
export function youtubeThumbnailUrlFromPreviewUrl(parsed) {
  const id = youtubeVideoIdFromUrl(parsed);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
}

/**
 * @param {string} url
 */
export async function fetchBookmarkPreview(url) {
  const parsed = normalizePreviewUrl(url);
  if (!parsed) {
    return { ok: false, error: 'Invalid URL' };
  }
  assertPreviewUrlAllowed(parsed);

  const domain = parsed.hostname.replace(/^www\./i, '');
  const youtubeImageUrl = youtubeThumbnailUrlFromPreviewUrl(parsed);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'CanvasBookmarkBot/1.0',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        ok: true,
        url: parsed.toString(),
        domain,
        title: domain,
        description: null,
        imageUrl: youtubeImageUrl,
        siteName: domain,
        faviconUrl: null,
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const clipped = buf.subarray(0, MAX_BODY_BYTES);
    const html = clipped.toString('utf8');
    const og = parseOpenGraphFromHtml(html);
    const title = og.title || domain;
    const imageUrl =
      resolvePreviewImageUrl(parsed.toString(), og.imageUrl)
      || youtubeImageUrl;
    let faviconUrl = null;
    try {
      faviconUrl = new URL('/favicon.ico', parsed.origin).toString();
    } catch {
      faviconUrl = null;
    }
    return {
      ok: true,
      url: parsed.toString(),
      domain,
      title,
      description: og.description,
      imageUrl,
      siteName: og.siteName || domain,
      faviconUrl,
    };
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Request timed out' : (e.message || 'Fetch failed');
    return {
      ok: false,
      error: message,
      url: parsed.toString(),
      domain,
      title: domain,
      description: null,
      imageUrl: youtubeImageUrl,
      siteName: domain,
      faviconUrl: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
