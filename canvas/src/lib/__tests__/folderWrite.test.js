import { describe, expect, it, vi } from 'vitest';
import {
  buildBookmarkShortcutFile,
  getFileHandleAtPath,
  writeBookmarkFile,
} from '../folderWrite.js';

describe('bookmark folder writes', () => {
  it('builds an Internet Shortcut file body', () => {
    expect(buildBookmarkShortcutFile('https://example.com/a')).toBe(
      '[InternetShortcut]\r\nURL=https://example.com/a\r\n',
    );
  });

  it('writes bookmark shortcuts as text files', async () => {
    const writable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const fileHandle = {
      createWritable: vi.fn(async () => writable),
    };
    const folderHandle = {
      getFileHandle: vi.fn(async () => fileHandle),
    };

    const filename = await writeBookmarkFile(folderHandle, {
      filename: 'links__example-com-v1.url',
      url: 'https://example.com/',
    });

    expect(filename).toBe('links__example-com-v1.url');
    expect(folderHandle.getFileHandle).toHaveBeenCalledWith(
      'links__example-com-v1.url',
      { create: true },
    );
    expect(writable.write).toHaveBeenCalledWith(
      '[InternetShortcut]\r\nURL=https://example.com/\r\n',
    );
    expect(writable.close).toHaveBeenCalled();
  });
});

describe('folder path reads', () => {
  it('resolves nested file handles from a linked folder root', async () => {
    const fileHandle = {};
    const nestedDir = {
      getFileHandle: vi.fn(async () => fileHandle),
    };
    const root = {
      getDirectoryHandle: vi.fn(async () => nestedDir),
    };

    await expect(getFileHandleAtPath(root, 'refs/img__photo-v1.png')).resolves.toBe(
      fileHandle,
    );
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('refs', { create: false });
    expect(nestedDir.getFileHandle).toHaveBeenCalledWith(
      'img__photo-v1.png',
      undefined,
    );
  });
});
