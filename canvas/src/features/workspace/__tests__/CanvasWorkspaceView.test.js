import { describe, expect, it } from 'vitest';
import { externalUrlForCard } from '../../../lib/bookmarkCardOpen.js';

describe('externalUrlForCard', () => {
  it('returns the pinned bookmark external URL', () => {
    expect(externalUrlForCard({
      type: 'bookmark',
      pinnedVersion: 2,
      versions: [
        { version: 1, externalUrl: 'https://old.example' },
        { version: 2, externalUrl: 'https://shop.example/product' },
      ],
    })).toBe('https://shop.example/product');
  });

  it('ignores non-bookmark cards', () => {
    expect(externalUrlForCard({
      type: 'markdown',
      versions: [{ version: 1, externalUrl: 'https://example.com' }],
    })).toBe('');
  });
});
