import { describe, expect, it, vi } from 'vitest';
import {
  bookmarkMarkdownFilenameFromShortcut,
  buildBookmarkMarkdownFile,
  buildBookmarkShortcutFile,
  getFileHandleAtPath,
  writeBinaryFileAtPath,
  writeBookmarkFile,
} from '../folderWrite.js';

describe('bookmark folder writes', () => {
  it('builds an Internet Shortcut file body', () => {
    expect(buildBookmarkShortcutFile('https://example.com/a')).toBe(
      '[InternetShortcut]\r\nURL=https://example.com/a\r\n',
    );
  });

  it('builds a reserved Markdown bookmark body and filename', () => {
    expect(bookmarkMarkdownFilenameFromShortcut('links__example-com-v1.url')).toBe(
      'links__example-com-v1.bookmark.md',
    );
    expect(
      buildBookmarkMarkdownFile({
        title: 'Example',
        url: 'https://example.com/',
      }),
    ).toBe('# Example\n\nURL: https://example.com/\n');
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

  it('falls back to reserved Markdown when shortcut names are blocked', async () => {
    const markdownWritable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const markdownFileHandle = {
      createWritable: vi.fn(async () => markdownWritable),
    };
    const folderHandle = {
      getFileHandle: vi
        .fn()
        .mockRejectedValueOnce(new DOMException('Name is not allowed.', 'NotAllowedError'))
        .mockResolvedValueOnce(markdownFileHandle),
    };

    const filename = await writeBookmarkFile(folderHandle, {
      filename: 'links__example-com-v1.url',
      title: 'Example',
      url: 'https://example.com/',
    });

    expect(filename).toBe('links__example-com-v1.bookmark.md');
    expect(folderHandle.getFileHandle).toHaveBeenNthCalledWith(
      1,
      'links__example-com-v1.url',
      { create: true },
    );
    expect(folderHandle.getFileHandle).toHaveBeenNthCalledWith(
      2,
      'links__example-com-v1.bookmark.md',
      { create: true },
    );
    expect(markdownWritable.write).toHaveBeenCalledWith(
      '# Example\n\nURL: https://example.com/\n',
    );
  });

  it('overwrites existing Markdown bookmark sidecars as Markdown', async () => {
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
      filename: 'links__example-com-v1.bookmark.md',
      title: 'Updated Example',
      url: 'https://example.com/updated',
    });

    expect(filename).toBe('links__example-com-v1.bookmark.md');
    expect(folderHandle.getFileHandle).toHaveBeenCalledTimes(1);
    expect(folderHandle.getFileHandle).toHaveBeenCalledWith(
      'links__example-com-v1.bookmark.md',
      { create: true },
    );
    expect(writable.write).toHaveBeenCalledWith(
      '# Updated Example\n\nURL: https://example.com/updated\n',
    );
  });
});

describe('binary folder writes', () => {
  it('writes nested generated image paths', async () => {
    const writable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const fileHandle = {
      createWritable: vi.fn(async () => writable),
    };
    const agentDir = {
      getFileHandle: vi.fn(async () => fileHandle),
    };
    const generatedDir = {
      getDirectoryHandle: vi.fn(async () => agentDir),
    };
    const root = {
      getDirectoryHandle: vi.fn(async () => generatedDir),
    };

    const bytes = new Uint8Array([137, 80, 78, 71]);
    await writeBinaryFileAtPath(
      root,
      'generated/facade-agent/2026-06-24_0717_facade-agent_exec-0001_v01.png',
      bytes,
    );

    expect(root.getDirectoryHandle).toHaveBeenCalledWith('generated', { create: true });
    expect(generatedDir.getDirectoryHandle).toHaveBeenCalledWith('facade-agent', { create: true });
    expect(agentDir.getFileHandle).toHaveBeenCalledWith(
      '2026-06-24_0717_facade-agent_exec-0001_v01.png',
      { create: true },
    );
    expect(writable.write).toHaveBeenCalledWith(bytes);
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
