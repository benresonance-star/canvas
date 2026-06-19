import { describe, it, expect } from 'vitest';
import { mergeArtifactRefsIntoCards } from '../syncIngest.js';

describe('mergeArtifactRefsIntoCards', () => {
  it('returns empty array when cards is null', () => {
    expect(mergeArtifactRefsIntoCards(null, { k: { versions: [] } })).toEqual([]);
  });

  it('handles card with null versions', () => {
    const cards = [{ key: 'a', versions: null }];
    const grouped = {
      a: {
        versions: [{ version: 1, artifactRef: { id: 'art-1' } }],
      },
    };
    const result = mergeArtifactRefsIntoCards(cards, grouped);
    expect(result[0].versions).toEqual([]);
  });

  it('merges artifact refs when grouped key is canonical and card key is legacy', () => {
    const cards = [{
      key: 'general__playbook-v1',
      versions: [{ version: 1, artifactRef: null }],
    }];
    const grouped = {
      'general__playbook': {
        versions: [{ version: 1, artifactRef: { id: 'art-2' }, content_hash: 'h2' }],
      },
    };
    const result = mergeArtifactRefsIntoCards(cards, grouped);
    expect(result[0].versions[0].artifactRef).toEqual({ id: 'art-2' });
    expect(result[0].versions[0].content_hash).toBe('h2');
  });

  it('merges artifact refs after rename reconciliation updates the card key', () => {
    const cards = [{
      key: 'docs__renamed',
      versions: [{ version: 1, filename: 'docs__renamed-v1.md', artifactRef: null }],
    }];
    const grouped = {
      'docs__renamed': {
        versions: [{
          version: 1,
          filename: 'docs__renamed-v1.md',
          artifactRef: { id: 'art-renamed', type: 'artifact' },
          content_hash: 'hash-renamed',
        }],
      },
    };

    const result = mergeArtifactRefsIntoCards(cards, grouped);

    expect(result[0].versions[0].artifactRef).toEqual({
      id: 'art-renamed',
      type: 'artifact',
    });
    expect(result[0].versions[0].content_hash).toBe('hash-renamed');
  });
});
