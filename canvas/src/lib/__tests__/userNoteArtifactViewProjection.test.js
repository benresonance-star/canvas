import { describe, expect, it } from 'vitest';
import {
  composeUserNoteArtifactViews,
  summarizeUserNoteArtifactViewComparison,
} from '../userNoteArtifactViewProjection.js';

const card = {
  id: 'c1', type: 'user_note', x: 1, y: 2, width: 3, height: 4,
  versions: [{ artifactRef: { id: 'a1' } }],
};
const view = {
  artifactId: 'a1', viewType: 'card', surface: 'canvas',
  x: 10, y: 20, width: 30, height: 40,
};

describe('composeUserNoteArtifactViews', () => {
  it('reports shadow drift without changing legacy geometry', () => {
    const result = composeUserNoteArtifactViews({ cards: [card] }, [view], { mode: 'shadow' });
    expect(result.payload.cards[0].x).toBe(1);
    expect(result.mismatches[0].category).toBe('geometry_mismatch');
  });

  it('composes canonical geometry while retaining content', () => {
    const result = composeUserNoteArtifactViews({ cards: [card] }, [view], { mode: 'canonical' });
    expect(result.payload.cards[0]).toMatchObject({ x: 10, y: 20, width: 30, height: 40 });
    expect(result.payload.cards[0].versions).toEqual(card.versions);
  });

  it('summarizes clean and mismatched cards for rollout telemetry', () => {
    const secondCard = { ...card, id: 'c2', versions: [{ artifactRef: { id: 'a2' } }] };
    expect(summarizeUserNoteArtifactViewComparison(
      { cards: [card, secondCard] },
      [{ category: 'geometry_mismatch', cardId: 'c1' }],
    )).toEqual({
      loads: 1,
      eligible_cards: 2,
      geometry_mismatch: 1,
      matched_cards: 1,
    });
  });
});
