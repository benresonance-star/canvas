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
});
