import { describe, expect, it } from 'vitest';
import { scanFolderFiles } from '../folderScan.js';

function fileHandle(name, body = 'hello') {
  return {
    kind: 'file',
    name,
    async getFile() {
      return new File([body], name, {
        type: 'text/markdown',
        lastModified: 1,
      });
    },
  };
}

function directoryHandle(name, entries) {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries;
    },
  };
}

describe('scanFolderFiles', () => {
  it('recursively scans nested files and preserves root-compatible keys', async () => {
    const root = directoryHandle('project', [
      fileHandle('notes__root-v1.md', 'root'),
      directoryHandle('refs', [
        fileHandle('img__photo-v1.md', 'a'),
        directoryHandle('nested', [
          fileHandle('img__photo-v1.md', 'b'),
        ]),
      ]),
      directoryHandle('node_modules', [
        fileHandle('notes__ignored-v1.md', 'ignored'),
      ]),
    ]);

    const { found, truncated } = await scanFolderFiles(root, {
      projectId: 'p1',
    });

    expect(truncated).toBe(false);
    expect(found.map((f) => f.relativePath).sort()).toEqual([
      'notes__root-v1.md',
      'refs/img__photo-v1.md',
      'refs/nested/img__photo-v1.md',
    ]);
    expect(found.map((f) => f.cardKey).sort()).toEqual([
      'notes__root',
      'refs/img__photo',
      'refs/nested/img__photo',
    ]);
  });

  it('respects stale scan cancellation', async () => {
    const root = directoryHandle('project', [
      fileHandle('notes__first-v1.md', 'first'),
      fileHandle('notes__second-v1.md', 'second'),
    ]);
    let calls = 0;

    const { found } = await scanFolderFiles(root, {
      isStale: () => calls++ > 1,
    });

    expect(found.map((f) => f.filename)).toEqual(['notes__first-v1.md']);
  });

  it('parses bookmark Markdown sidecars as bookmark artifacts', async () => {
    const root = directoryHandle('project', [
      fileHandle('links__youtu-be-cccccccc-v1.bookmark.md', '# DF64V Review\n\nURL: https://youtu.be/x\n'),
      fileHandle('notes__real-v1.md', 'real note'),
    ]);

    const { found } = await scanFolderFiles(root, {
      projectId: 'p1',
      fetchBookmarkPreview: async () => ({
        domain: 'youtu.be',
        title: 'Fetched title',
        imageUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
        siteName: 'YouTube',
        faviconUrl: 'https://youtu.be/favicon.ico',
        description: 'Video preview',
      }),
    });

    expect(found.map((f) => f.filename)).toEqual([
      'links__youtu-be-cccccccc-v1.bookmark.md',
      'notes__real-v1.md',
    ]);
    expect(found[0]).toMatchObject({
      cardKey: 'links__youtu-be-cccccccc',
      cardType: 'bookmark',
      externalUrl: 'https://youtu.be/x',
      prefix: 'links',
      name: 'youtu-be-cccccccc',
      version: 1,
      ext: 'bookmark.md',
      artifactSyncState: 'pending',
      bookmarkPreview: {
        title: 'DF64V Review',
        domain: 'youtu.be',
        imageUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
      },
    });
    expect(found[1].cardKey).toBe('notes__real');
  });

  it('ignores generated flow snapshots', async () => {
    const root = directoryHandle('project', [
      directoryHandle('flows', [
        fileHandle('customer-onboarding--flow-1.flow.json', '{"schemaVersion":1}'),
      ]),
      fileHandle('notes__real-v1.md', 'real note'),
    ]);

    const { found } = await scanFolderFiles(root, { projectId: 'p1' });

    expect(found.map((entry) => entry.relativePath)).toEqual(['notes__real-v1.md']);
  });
});
