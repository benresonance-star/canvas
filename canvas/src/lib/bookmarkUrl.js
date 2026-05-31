import { sha256HexFromString } from './ingest/hashFile.js';

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeBookmarkUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * @param {string} normalizedUrl
 */
export async function bookmarkContentHash(normalizedUrl) {
  return sha256HexFromString(normalizedUrl);
}

/**
 * @param {string} url
 * @returns {string}
 */
export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * @param {string} domain
 * @param {number} [version]
 */
export function syntheticBookmarkFilename(domain, version = 1) {
  const slug = (domain || 'link')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'link';
  return `links__${slug}-v${version}.url`;
}

/**
 * @param {string} normalizedUrl
 */
export function bookmarkCardKeyFromUrl(normalizedUrl) {
  const domain = domainFromUrl(normalizedUrl);
  const slug = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'link';
  return `links__${slug}`;
}
