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
});
