import { describe, expect, it, vi } from 'vitest';

vi.mock('../ingest/hashFile.js', () => ({
  sha256Hex: vi.fn(async () => 'hash-code'),
}));

import { readFileEntry } from '../readFile.js';

describe('readFileEntry', () => {
  it('reads TypeScript files as inline text content', async () => {
    const file = Object.assign(
      new Blob(['export const answer: number = 42;\n'], { type: 'text/typescript' }),
      {
        name: 'src__example-v1.ts',
        lastModified: 123,
      },
    );

    const result = await readFileEntry(file);

    expect(result).toMatchObject({
      filename: 'src__example-v1.ts',
      content: 'export const answer: number = 42;\n',
      content_hash: 'hash-code',
      inline: true,
    });
  });

  it('reads JSON and Python files as inline text content', async () => {
    const json = Object.assign(
      new Blob(['{"name":"canvas"}\n'], { type: 'application/json' }),
      { name: 'data__settings-v1.json', lastModified: 123 },
    );
    const python = Object.assign(
      new Blob(['def run():\n    return True\n'], { type: 'text/x-python' }),
      { name: 'scripts__run-v1.py', lastModified: 123 },
    );

    await expect(readFileEntry(json)).resolves.toMatchObject({
      filename: 'data__settings-v1.json',
      content: '{"name":"canvas"}\n',
      inline: true,
    });
    await expect(readFileEntry(python)).resolves.toMatchObject({
      filename: 'scripts__run-v1.py',
      content: 'def run():\n    return True\n',
      inline: true,
    });
  });
});
