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

export function isAmazonBookmarkUrl(url) {
  const domain = domainFromUrl(url).toLowerCase();
  return domain === 'amzn.to' || domain.startsWith('amazon.') || domain.endsWith('.amazon.com');
}

export function isGenericAmazonBookmarkImage(imageUrl) {
  if (!imageUrl) return false;
  try {
    const parsed = new URL(imageUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      host.includes('amazon')
      && (
        path.includes('logo')
        || path.includes('/social')
        || path.includes('/api-share/')
      )
    );
  } catch {
    return false;
  }
}

export function bookmarkSlugFromDomain(domain) {
  return (domain || 'link')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'link';
}

export function bookmarkLinkIdFromCardId(cardId) {
  return String(cardId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8);
}

export function bookmarkKeySlug(domain, linkId = null) {
  const slug = bookmarkSlugFromDomain(domain);
  const safeLinkId = bookmarkLinkIdFromCardId(linkId);
  return safeLinkId ? `${slug}-${safeLinkId}` : slug;
}

/**
 * @param {string} domain
 * @param {number} [version]
 */
export function syntheticBookmarkFilename(domain, version = 1, linkId = null) {
  const slug = bookmarkKeySlug(domain, linkId);
  return `links__${slug}-v${version}.url`;
}

/**
 * @param {string} normalizedUrl
 */
export function bookmarkCardKeyFromUrl(normalizedUrl, linkId = null) {
  const domain = domainFromUrl(normalizedUrl);
  const slug = bookmarkKeySlug(domain, linkId);
  return `links__${slug}`;
}
