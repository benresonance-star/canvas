import { describe, expect, it, vi } from 'vitest';
import {
  bookmarkNeedsPreviewEnrich,
  bookmarkPinnedVersion,
  collectBookmarksNeedingPreviewEnrich,
  enrichBookmarkCardWithPreview,
  enrichBookmarkCardsInProject,
  enrichBookmarkCardsWithPreview,
} from '../bookmarkPreviewEnrich.js';

describe('bookmarkPreviewEnrich', () => {
  const bookmarkCard = {
    key: 'links__example-com-abc12345',
    type: 'bookmark',
    pinnedVersion: 1,
    versions: [{
      version: 1,
      externalUrl: 'https://example.com/page',
      bookmarkPreview: { title: 'Example', domain: 'example.com', imageUrl: null },
    }],
  };

  it('bookmarkNeedsPreviewEnrich is true when imageUrl is missing', () => {
    expect(bookmarkNeedsPreviewEnrich(bookmarkCard)).toBe(true);
  });

  it('bookmarkNeedsPreviewEnrich is false when previewCacheKey exists', () => {
    const card = {
      ...bookmarkCard,
      versions: [{
        ...bookmarkCard.versions[0],
        previewCacheKey: 'p1:links__example:v1',
        bookmarkPreview: { imageUrl: null },
      }],
    };
    expect(bookmarkNeedsPreviewEnrich(card)).toBe(false);
  });

  it('bookmarkNeedsPreviewEnrich is false when imageUrl is set for non-Amazon links', () => {
    const card = {
      ...bookmarkCard,
      versions: [{
        ...bookmarkCard.versions[0],
        bookmarkPreview: {
          imageUrl: 'https://example.com/og.png',
          domain: 'example.com',
        },
      }],
    };
    expect(bookmarkNeedsPreviewEnrich(card)).toBe(false);
  });

  it('enrichBookmarkCardWithPreview merges fetched preview metadata', async () => {
    const fetchPreview = vi.fn(async () => ({
      ok: true,
      url: 'https://example.com/page',
      domain: 'example.com',
      title: 'Example Page',
      description: 'Desc',
      imageUrl: 'https://example.com/og.png',
      siteName: 'Example',
      faviconUrl: 'https://example.com/favicon.ico',
    }));

    const { card, changed } = await enrichBookmarkCardWithPreview(bookmarkCard, {
      projectId: 'p1',
      fetchPreview,
    });

    expect(changed).toBe(true);
    expect(fetchPreview).toHaveBeenCalledWith('https://example.com/page');
    expect(bookmarkPinnedVersion(card).bookmarkPreview).toMatchObject({
      title: 'Example Page',
      imageUrl: 'https://example.com/og.png',
      domain: 'example.com',
    });
  });

  it('enrichBookmarkCardsWithPreview only updates cards that need enrichment', async () => {
    const withImage = {
      key: 'links__has-image',
      type: 'bookmark',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        externalUrl: 'https://has-image.test/',
        bookmarkPreview: { imageUrl: 'https://has-image.test/og.png' },
      }],
    };
    const fetchPreview = vi.fn(async (url) => ({
      ok: true,
      url,
      domain: 'example.com',
      title: 'Fetched',
      imageUrl: 'https://example.com/og.png',
    }));

    const { cards, changed } = await enrichBookmarkCardsWithPreview(
      [bookmarkCard, withImage],
      { projectId: 'p1', fetchPreview },
    );

    expect(changed).toBe(true);
    expect(fetchPreview).toHaveBeenCalledTimes(1);
    expect(bookmarkPinnedVersion(cards[0]).bookmarkPreview.imageUrl).toBe(
      'https://example.com/og.png',
    );
    expect(bookmarkPinnedVersion(cards[1]).bookmarkPreview.imageUrl).toBe(
      'https://has-image.test/og.png',
    );
  });

  it('enrichBookmarkCardsInProject enriches canvas and dock bookmarks', async () => {
    const dockCard = {
      key: 'links__dock-link',
      type: 'bookmark',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        externalUrl: 'https://dock.example/',
        bookmarkPreview: { imageUrl: null },
      }],
    };
    const fetchPreview = vi.fn(async (url) => ({
      ok: true,
      url,
      domain: 'dock.example',
      title: 'Dock',
      imageUrl: 'https://dock.example/og.png',
    }));

    const result = await enrichBookmarkCardsInProject(
      'p1',
      [bookmarkCard],
      [dockCard],
      { fetchPreview },
    );

    expect(result.changed).toBe(true);
    expect(fetchPreview).toHaveBeenCalledTimes(2);
    expect(collectBookmarksNeedingPreviewEnrich(result.cards, result.stagedSyncCards))
      .toHaveLength(0);
  });
});
