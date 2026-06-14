import { describe, expect, it, vi } from 'vitest';
import { buildBookmarkShortcutFile, writeBookmarkFile } from '../folderWrite.js';

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
