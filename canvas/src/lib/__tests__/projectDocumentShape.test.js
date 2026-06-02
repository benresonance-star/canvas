import { describe, it, expect } from 'vitest';
import {
  summarizeProjectDocumentShape,
  shouldOfferDockRestore,
  countRestorableDockCards,
} from '../projectDocumentShape.js';

describe('projectDocumentShape', () => {
  it('summarizeProjectDocumentShape detects dock-only', () => {
    const shape = summarizeProjectDocumentShape({
      cards: [],
      stagedSyncCards: [{ stagingId: 's1', key: 'notes__a' }],
      artifactPlacements: {
        notes__a: { surface: 'dock' },
      },
    });
    expect(shape.isDockOnly).toBe(true);
    expect(shape.canvasCards).toBe(0);
    expect(shape.dockCards).toBe(1);
    expect(shape.placementDock).toBe(1);
  });

  it('shouldOfferDockRestore when canvas empty and dock has items', () => {
    expect(
      shouldOfferDockRestore({
        cards: [],
        stagedSyncCards: [{ key: 'img__x' }],
      }),
    ).toBe(true);
    expect(
      shouldOfferDockRestore({
        cards: [{ id: 'c1' }],
        stagedSyncCards: [{ key: 'img__x' }],
      }),
    ).toBe(false);
  });

  it('countRestorableDockCards respects suppressed keys', () => {
    const doc = {
      stagedSyncCards: [
        { key: 'notes__a' },
        { key: 'notes__b' },
      ],
    };
    expect(countRestorableDockCards(doc)).toBe(2);
    expect(
      countRestorableDockCards(doc, new Set(['notes__a'])),
    ).toBe(1);
  });
});
