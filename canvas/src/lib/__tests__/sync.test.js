import { describe, expect, it } from 'vitest';
import {
  mergeDiskPreviewIntoCardVersions,
  shouldRefreshVersionFromDisk,
} from '../sync.js';

describe('shouldRefreshVersionFromDisk', () => {
  it('returns true when content_hash differs', () => {
    expect(
      shouldRefreshVersionFromDisk(
        { version: 1, content_hash: 'aaa', ext: 'md' },
        { version: 1, content_hash: 'bbb', ext: 'md' },
      ),
    ).toBe(true);
  });

  it('returns true when markdown content differs', () => {
    expect(
      shouldRefreshVersionFromDisk(
        { version: 1, content: '# old', ext: 'md' },
        { version: 1, content: '# new', ext: 'md' },
      ),
    ).toBe(true);
  });
});

describe('mergeDiskPreviewIntoCardVersions', () => {
  it('merges updated transcript content from disk', () => {
    const merged = mergeDiskPreviewIntoCardVersions(
      [{ version: 1, content: 'old', content_hash: 'h1', ext: 'md' }],
      [{ version: 1, content: 'new transcript', content_hash: 'h2', ext: 'md' }],
    );
    expect(merged[0].content).toBe('new transcript');
    expect(merged[0].content_hash).toBe('h2');
  });
});
