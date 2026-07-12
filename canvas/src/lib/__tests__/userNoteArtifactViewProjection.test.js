import { describe, expect, it } from 'vitest';
import {
  composeUserNoteArtifactViews,
  resolveArtifactViewMode,
  resolveArtifactViewWriteMode,
  shouldReadUserNoteArtifactViews,
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
  it('defaults reads and writes to canonical authority after payload contraction', () => {
    expect(resolveArtifactViewMode({})).toBe('canonical');
    expect(resolveArtifactViewWriteMode({})).toBe('canonical');
    expect(resolveArtifactViewMode({ VITE_USER_NOTE_ARTIFACT_VIEWS: 'legacy' })).toBe('legacy');
    expect(resolveArtifactViewWriteMode({ VITE_USER_NOTE_ARTIFACT_VIEW_WRITES: 'legacy' }))
      .toBe('legacy');
  });
  it('keeps canonical reads authoritative during local-only project switches', () => {
    expect(shouldReadUserNoteArtifactViews('legacy', { localOnly: false })).toBe(false);
    expect(shouldReadUserNoteArtifactViews('shadow', { localOnly: true })).toBe(false);
    expect(shouldReadUserNoteArtifactViews('shadow', { localOnly: false })).toBe(true);
    expect(shouldReadUserNoteArtifactViews('canonical', { localOnly: true })).toBe(true);
  });

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

  it('attaches canonical versions to dock notes for surface transfers', () => {
    const staged = { ...card, stagingId: 's1' };
    const dockView = { artifactId: 'a1', viewType: 'card', surface: 'dock', version: 6 };

    const result = composeUserNoteArtifactViews(
      { cards: [], stagedSyncCards: [staged] }, [dockView], { mode: 'canonical' },
    );

    expect(result.payload.stagedSyncCards[0].artifactViewVersion).toBe(6);
    expect(result.mismatches).toEqual([]);
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
