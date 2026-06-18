import { describe, it, expect } from 'vitest';
import { saveUserNoteToProject, saveBookmarkToProject } from '../projectCardEdits.js';

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
});
