import { Buffer } from 'node:buffer';
import {
  assertPreviewUrlAllowed,
  normalizePreviewUrl,
  parseOpenGraphFromHtml,
} from './urlPreview.js';

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024;
const DEFAULT_MAX_URL_CHARS = 8000;

const URL_LINE_RE = /^(?:https?:\/\/|www\.)[^\s<>"']+/i;

/**
 * @param {string} html
 */
export function extractTextFromHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const urls = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !URL_LINE_RE.test(trimmed)) continue;
    const parsed = normalizePreviewUrl(trimmed);
    if (parsed) urls.add(parsed.toString());
  }
  return [...urls];
}

/**
 * @param {unknown} metadata
 */
export function parseArtifactMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  if (typeof metadata === 'object') return metadata;
  return {};
}

function clipText(text, maxChars) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatUrlSourceBlock({ url, title, description, content, error }) {
  if (error) {
    return `[Fetch failed: ${error}]\nURL: ${url}`;
  }
  return [
    `URL: ${url}`,
    title ? `Title: ${title}` : null,
    description ? `Description: ${description}` : null,
    content ? `Content:\n${content}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * @param {string} url
 * @param {{ maxChars?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function resolveUrlSourceText(url, {
  maxChars = DEFAULT_MAX_URL_CHARS,
  fetchImpl = fetch,
} = {}) {
  const parsed = normalizePreviewUrl(url);
  if (!parsed) {
    return formatUrlSourceBlock({ url, error: 'Invalid URL' });
  }
  try {
    assertPreviewUrlAllowed(parsed);
  } catch (error) {
    return formatUrlSourceBlock({
      url: parsed.toString(),
      error: error?.message || 'Preview not allowed for this host',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'CanvasLiveFeedBot/1.0',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const clipped = buf.subarray(0, MAX_HTML_BYTES);

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = clipped.toString('utf8');
      const og = parseOpenGraphFromHtml(html);
      const title = og.title || parsed.hostname;
      const description = og.description || null;
      const body = extractTextFromHtml(html);
      const contentBudget = Math.max(
        500,
        maxChars - (title?.length || 0) - (description?.length || 0) - 64,
      );
      return clipText(
        formatUrlSourceBlock({
          url: parsed.toString(),
          title,
          description,
          content: clipText(body, contentBudget),
        }),
        maxChars,
      );
    }

    if (contentType.includes('text/plain') || contentType.includes('application/json')) {
      const plain = clipped.toString('utf8');
      return clipText(
        formatUrlSourceBlock({
          url: parsed.toString(),
          title: parsed.hostname,
          content: plain,
        }),
        maxChars,
      );
    }

    return clipText(
      formatUrlSourceBlock({
        url: parsed.toString(),
        title: parsed.hostname,
        description: `Content type: ${contentType || 'unknown'}`,
      }),
      maxChars,
    );
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Request timed out' : (error?.message || 'Fetch failed');
    return formatUrlSourceBlock({ url: parsed.toString(), error: message });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} manualText
 * @param {{ maxCharsPerUrl?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function resolveManualTextSource(manualText, options = {}) {
  const text = String(manualText || '').trim();
  if (!text) return '';

  const urls = extractUrlsFromText(text);
  if (!urls.length) return text;

  const nonUrlLines = text
    .split(/\r?\n/)
    .filter((line) => !URL_LINE_RE.test(line.trim()))
    .join('\n')
    .trim();

  const fetched = [];
  for (const url of urls) {
    fetched.push(await resolveUrlSourceText(url, {
      maxChars: options.maxCharsPerUrl ?? DEFAULT_MAX_URL_CHARS,
      fetchImpl: options.fetchImpl,
    }));
  }

  return [nonUrlLines, ...fetched].filter(Boolean).join('\n\n');
}

/**
 * @param {{ payload_text?: string | null, type?: string, metadata?: unknown }} artifactRow
 * @param {{ maxCharsPerUrl?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function resolveCanvasArtifactSource(artifactRow, options = {}) {
  if (!artifactRow) return '';
  const meta = parseArtifactMetadata(artifactRow.metadata);
  const externalUrl = meta.external_url || meta.externalUrl || null;
  const isBookmark = meta.canvas_kind === 'bookmark' || artifactRow.type === 'other' && externalUrl;

  if (isBookmark && externalUrl) {
    return resolveUrlSourceText(externalUrl, {
      maxChars: options.maxCharsPerUrl ?? DEFAULT_MAX_URL_CHARS,
      fetchImpl: options.fetchImpl,
    });
  }

  if (artifactRow.payload_text?.trim()) {
    return artifactRow.payload_text.trim();
  }

  if (externalUrl) {
    return resolveUrlSourceText(externalUrl, {
      maxChars: options.maxCharsPerUrl ?? DEFAULT_MAX_URL_CHARS,
      fetchImpl: options.fetchImpl,
    });
  }

  return '';
}
