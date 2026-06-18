import {
  normalizeBookmarkUrl,
  bookmarkCardKeyFromUrl,
  bookmarkContentHash,
} from './bookmarkUrl.js';
import { buildBookmarkPreviewState } from './ingest/createBookmarkArtifact.js';
import { validateUserNoteName } from './ingest/saveUserNote.js';

/**
 * Update note body/title in project JSON (no folder write).
 * @param {object} card
 * @param {{ body: string, name?: string, versionNum: number }} input
 */
export function saveUserNoteToProject(card, { body, name, versionNum }) {
  const nameValidation = validateUserNoteName(name ?? card.name);
  if (!nameValidation.ok) {
    return { ok: false, reason: nameValidation.reason };
  }
  const ver = card.versions?.find((v) => v.version === versionNum);
  if (!ver) {
    return { ok: false, reason: 'no_version' };
  }
  const versions = card.versions.map((v) =>
    v.version === versionNum ? { ...v, content: body } : v,
  );
  return {
    ok: true,
    projectOnly: true,
    cardUpdates: {
      name: nameValidation.name,
      versions,
    },
  };
}

/**
 * @param {object} card
 * @param {{ url: string, title?: string, preview?: object, linkId?: string | null }} input
 */
export async function saveBookmarkToProject(card, { url, title, preview, linkId = null }) {
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!normalizedUrl) {
    return { ok: false, reason: 'invalid_url' };
  }
  const bookmarkPreview = buildBookmarkPreviewState(
    preview ?? card.versions?.[0]?.bookmarkPreview ?? {},
    normalizedUrl,
  );
  const displayName =
    title?.trim()
    || bookmarkPreview.title
    || bookmarkPreview.domain
    || card.name;
  const contentHash = await bookmarkContentHash(normalizedUrl);
  const cardKey = bookmarkCardKeyFromUrl(normalizedUrl, linkId);
  const clearCachedPreview = Boolean(preview?.imageUrl);
  const versions = (card.versions ?? []).map((v) => ({
    ...(clearCachedPreview
      ? (() => {
        const next = { ...v };
        delete next.previewCacheKey;
        delete next.objectUrl;
        return next;
      })()
      : v),
    externalUrl: normalizedUrl,
    content_hash: contentHash,
    bookmarkPreview: {
      ...v.bookmarkPreview,
      ...bookmarkPreview,
      title: displayName,
    },
  }));
  return {
    ok: true,
    cardUpdates: {
      key: cardKey,
      name: displayName,
      versions,
    },
  };
}
