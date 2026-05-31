import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerOptimisticCard,
  mergeOptimisticCardsIntoDoc,
  resetOptimisticCardsForTests,
} from '../optimisticCards.js';

describe('optimisticCards', () => {
  beforeEach(() => {
    resetOptimisticCardsForTests();
  });

  it('merges local optimistic cards into server doc', () => {
    registerOptimisticCard('p1', 'local-only');
    const server = {
      cards: [{ id: 'server', key: 'k1' }],
      canvasView: { x: 0, y: 0, zoom: 1 },
    };
    const local = [
      { id: 'server', key: 'k1' },
      { id: 'local-only', key: 'k2', x: 10, y: 20 },
    ];
    const merged = mergeOptimisticCardsIntoDoc('p1', server, local);
    expect(merged.cards).toHaveLength(2);
    expect(merged.cards[1].id).toBe('local-only');
  });
});
