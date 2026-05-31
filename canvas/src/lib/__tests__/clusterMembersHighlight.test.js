import { describe, expect, it } from 'vitest';
import {
  buildHighlightedCardIds,
  cardIdForClusterMember,
  isClusterMemberHighlighted,
} from '../clusterMembers.js';

describe('buildHighlightedCardIds', () => {
  it('includes active and selected ids', () => {
    const ids = buildHighlightedCardIds('card-a', new Set(['card-b']));
    expect(ids.has('card-a')).toBe(true);
    expect(ids.has('card-b')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('returns empty set when nothing selected', () => {
    expect(buildHighlightedCardIds(null, undefined).size).toBe(0);
  });
});

describe('cardIdForClusterMember', () => {
  const cards = [
    { id: 'card-1', key: 'key-1', versions: [] },
    { id: 'card-2', key: 'key-2', versions: [] },
  ];
  const artifactMap = new Map([
    ['art-1', { cardId: 'card-1', cardKey: 'key-1' }],
  ]);

  it('resolves by artifact id', () => {
    expect(cardIdForClusterMember({ id: 'art-1' }, artifactMap, cards)).toBe('card-1');
  });

  it('falls back to cardKey', () => {
    expect(
      cardIdForClusterMember({ id: 'art-unknown', cardKey: 'key-2' }, artifactMap, cards),
    ).toBe('card-2');
  });

  it('returns null when not on canvas', () => {
    expect(
      cardIdForClusterMember({ id: 'art-x', cardKey: 'missing' }, artifactMap, cards),
    ).toBeNull();
  });
});

describe('isClusterMemberHighlighted', () => {
  const cards = [{ id: 'card-1', key: 'key-1', versions: [] }];
  const artifactMap = new Map([['art-1', { cardId: 'card-1', cardKey: 'key-1' }]]);
  const member = { id: 'art-1' };

  it('is true for active card', () => {
    expect(
      isClusterMemberHighlighted(member, artifactMap, cards, 'card-1', new Set()),
    ).toBe(true);
  });

  it('is true for shift-selected card', () => {
    expect(
      isClusterMemberHighlighted(member, artifactMap, cards, null, new Set(['card-1'])),
    ).toBe(true);
  });

  it('is false when another card is active', () => {
    expect(
      isClusterMemberHighlighted(member, artifactMap, cards, 'other', new Set()),
    ).toBe(false);
  });
});
