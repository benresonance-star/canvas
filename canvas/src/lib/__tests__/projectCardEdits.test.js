import { describe, it, expect } from 'vitest';
import { saveUserNoteToProject, saveBookmarkToProject, saveTextContentToProject } from '../projectCardEdits.js';

describe('saveTextContentToProject', () => {
  it('updates pinned version content without renaming', () => {
    const card = {
      id: 'c1',
      key: 'markdown__readme',
      name: 'readme',
      type: 'markdown',
      prefix: 'markdown',
      pinnedVersion: 1,
      versions: [{ version: 1, content: 'old', filename: 'markdown__readme-v1.md' }],
    };
    const result = saveTextContentToProject(card, {
      body: 'new body',
      versionNum: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.cardUpdates.versions[0].content).toBe('new body');
    expect(result.cardUpdates.name).toBeUndefined();
  });
});

describe('saveUserNoteToProject', () => {
  it('updates note content and title in project JSON', () => {
    const card = {
      id: 'c1',
      key: 'notes__test',
      name: 'test',
      type: 'user_note',
      prefix: 'notes',
      pinnedVersion: 1,
      versions: [{ version: 1, content: 'old', filename: 'notes__test-v1.md' }],
    };
    const result = saveUserNoteToProject(card, {
      body: 'new body',
      name: 'renamed',
      versionNum: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.cardUpdates.name).toBe('renamed');
    expect(result.cardUpdates.versions[0].content).toBe('new body');
  });
});

describe('saveBookmarkToProject', () => {
  it('updates bookmark url and display name', async () => {
    const card = {
      id: 'b1',
      key: 'links__example-com',
      name: 'Example',
      type: 'bookmark',
      prefix: 'links',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        externalUrl: 'https://example.com',
        bookmarkPreview: { title: 'Example', domain: 'example.com' },
      }],
    };
    const result = await saveBookmarkToProject(card, {
      url: 'https://cursor.com',
      title: 'Cursor',
      preview: { title: 'Cursor', domain: 'cursor.com' },
    });
    expect(result.ok).toBe(true);
    expect(result.cardUpdates.name).toBe('Cursor');
    expect(result.cardUpdates.key).toBe('links__cursor-com');
    expect(result.cardUpdates.versions[0].externalUrl).toMatch(/^https:\/\/cursor\.com\/?$/);
  });

  it('preserves the link id in bookmark keys when provided', async () => {
    const card = {
      id: 'abc12345-card-id',
      key: 'links__example-com-abc12345',
      name: 'Example',
      type: 'bookmark',
      prefix: 'links',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        externalUrl: 'https://example.com',
        bookmarkPreview: { title: 'Example', domain: 'example.com' },
      }],
    };
    const result = await saveBookmarkToProject(card, {
      url: 'https://cursor.com',
      title: 'Cursor',
      preview: { title: 'Cursor', domain: 'cursor.com' },
      linkId: card.id,
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates.key).toBe('links__cursor-com-abc12345');
  });

  it('clears stale cached thumbnails when refreshed preview image is saved', async () => {
    const card = {
      id: 'amazon-card',
      key: 'links__amazon-com-au',
      name: 'Amazon',
      type: 'bookmark',
      prefix: 'links',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        externalUrl: 'https://www.amazon.com.au/dp/B000000',
        previewCacheKey: 'old-amazon-logo-cache',
        objectUrl: 'blob:old-logo',
        bookmarkPreview: {
          title: 'Amazon',
          domain: 'amazon.com.au',
          imageUrl: 'https://images-na.ssl-images-amazon.com/images/G/01/social/api-share/amazon_logo.png',
        },
      }],
    };

    const result = await saveBookmarkToProject(card, {
      url: 'https://www.amazon.com.au/dp/B000000',
      title: 'Coffee Bean Dosing Cup',
      preview: {
        title: 'Coffee Bean Dosing Cup',
        domain: 'amazon.com.au',
        imageUrl: 'data:image/jpeg;base64,page',
      },
      linkId: card.id,
    });

    expect(result.ok).toBe(true);
    expect(result.cardUpdates.versions[0].previewCacheKey).toBeUndefined();
    expect(result.cardUpdates.versions[0].objectUrl).toBeUndefined();
    expect(result.cardUpdates.versions[0].bookmarkPreview.imageUrl).toBe(
      'data:image/jpeg;base64,page',
    );
  });
});
