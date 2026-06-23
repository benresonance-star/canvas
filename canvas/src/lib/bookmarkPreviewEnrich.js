import { fetchBookmarkPreview } from './bookmarkPreviewApi.js';
import { buildBookmarkPreviewState } from './ingest/createBookmarkArtifact.js';
import {
  normalizeBookmarkUrl,
  isAmazonBookmarkUrl,
  isGenericAmazonBookmarkImage,
} from './bookmarkUrl.js';
import { normalizeCardType } from './filename.js';
import { previewCacheKey, putPreview } from './previewStore.js';

const DEFAULT_CONCURRENCY = 3;

/**
 * @param {{ versions?: Array<{ version?: number }>, pinnedVersion?: number }} card
 */
export function bookmarkPinnedVersion(card) {
  const versions = card?.versions ?? [];
  return versions.find((v) => v.version === card?.pinnedVersion) ?? versions[0];
}

/**
 * @param {{ type?: string, versions?: Array<{ externalUrl?: string, bookmarkPreview?: { imageUrl?: string | null }, previewCacheKey?: string | null }> }} card
 */
export function bookmarkNeedsPreviewEnrich(card) {
  if (normalizeCardType(card?.type) !== 'bookmark') return false;
  const pinned = bookmarkPinnedVersion(card);
  const url = normalizeBookmarkUrl(pinned?.externalUrl);
  if (!url) return false;
  if (pinned?.previewCacheKey) return false;
  const imageUrl = pinned?.bookmarkPreview?.imageUrl;
  if (!imageUrl) return true;
  return isAmazonBookmarkUrl(url) && isGenericAmazonBookmarkImage(imageUrl);
}

/**
 * @param {string} projectId
 * @param {string} cardKey
 * @param {number} version
 * @param {string | null | undefined} imageUrl
 */
export async function cacheBookmarkThumbnail(projectId, cardKey, version, imageUrl) {
  if (!imageUrl || !projectId || !cardKey) return null;
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
 * @param {object} card
 * @param {{ projectId: string, fetchPreview?: typeof fetchBookmarkPreview }} options
 */
export async function enrichBookmarkCardWithPreview(
  card,
  { projectId, fetchPreview = fetchBookmarkPreview },
) {
  if (!bookmarkNeedsPreviewEnrich(card)) return { card, changed: false };
  const pinned = bookmarkPinnedVersion(card);
  const url = normalizeBookmarkUrl(pinned?.externalUrl);
  if (!url) return { card, changed: false };

  const result = await fetchPreview(url);
  const bookmarkPreview = buildBookmarkPreviewState(result, url);
  if (!bookmarkPreview.imageUrl && !result?.title) {
    return { card, changed: false };
  }

  const versionNum = pinned?.version ?? 1;
  const cacheKey = await cacheBookmarkThumbnail(
    projectId,
    card.key,
    versionNum,
    bookmarkPreview.imageUrl,
  );

  const enrichedVersion = {
    ...pinned,
    bookmarkPreview: {
      ...(pinned.bookmarkPreview ?? {}),
      ...bookmarkPreview,
    },
    ...(cacheKey
      ? {
          previewCacheKey: cacheKey,
          objectUrl: undefined,
          dataUrl: undefined,
        }
      : {}),
  };

  const versions = (card.versions ?? []).map((v) =>
    v.version === enrichedVersion.version ? enrichedVersion : v,
  );

  return {
    card: { ...card, versions },
    changed: true,
  };
}

/**
 * @param {object[]} cards
 * @param {{ projectId: string, concurrency?: number, fetchPreview?: typeof fetchBookmarkPreview }} options
 */
export async function enrichBookmarkCardsWithPreview(
  cards,
  { projectId, concurrency = DEFAULT_CONCURRENCY, fetchPreview = fetchBookmarkPreview } = {},
) {
  if (!projectId || !cards?.length) {
    return { cards: cards ?? [], changed: false };
  }

  const targets = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => bookmarkNeedsPreviewEnrich(card));
  if (targets.length === 0) {
    return { cards, changed: false };
  }

  const next = [...cards];
  let changed = false;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(({ card }) =>
        enrichBookmarkCardWithPreview(card, { projectId, fetchPreview }),
      ),
    );
    results.forEach((result, batchIndex) => {
      if (!result.changed) return;
      changed = true;
      next[batch[batchIndex].index] = result.card;
    });
  }

  return { cards: next, changed };
}

/**
 * @param {string} projectId
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {{ concurrency?: number, fetchPreview?: typeof fetchBookmarkPreview }} [options]
 */
export async function enrichBookmarkCardsInProject(
  projectId,
  cards,
  stagedSyncCards,
  options = {},
) {
  const canvasResult = await enrichBookmarkCardsWithPreview(cards, {
    projectId,
    ...options,
  });
  const stagedResult = await enrichBookmarkCardsWithPreview(stagedSyncCards, {
    projectId,
    ...options,
  });
  return {
    cards: canvasResult.cards,
    stagedSyncCards: stagedResult.cards,
    changed: canvasResult.changed || stagedResult.changed,
  };
}

/**
 * @param {object[]} cards
 * @param {object[]} [stagedSyncCards]
 */
export function collectBookmarksNeedingPreviewEnrich(cards, stagedSyncCards = []) {
  return [...(cards ?? []), ...(stagedSyncCards ?? [])].filter(bookmarkNeedsPreviewEnrich);
}
