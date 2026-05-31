import { describe, it, expect } from 'vitest';
import {
  buildPlacementsFromArrays,
  deriveArraysFromPlacements,
  reconcileArtifactPlacements,
  attachArtifactPlacementsToPayload,
  applyPlacementMapToArrays,
  mergeLocalPlacementStateIntoDoc,
} from '../artifactPlacementsMap.js';

describe('artifactPlacementsMap', () => {
  it('buildPlacementsFromArrays maps canvas and dock', () => {
    const map = buildPlacementsFromArrays(
      [{ id: 'c1', key: 'notes__a', type: 'markdown', versions: [] }],
      [{ stagingId: 's1', key: 'notes__b', type: 'markdown', versions: [] }],
    );
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['notes__a'].surface).toBe('canvas');
    expect(map['notes__b'].surface).toBe('dock');
  });

  it('deriveArraysFromPlacements round-trips v1 legacy records', () => {
    const cards = [{ id: 'c1', key: 'img__x', type: 'image', versions: [] }];
    const staged = [{ stagingId: 's1', key: 'img__y', type: 'image', versions: [] }];
    const map = {
      'img__x': { surface: 'canvas', record: cards[0] },
      'img__y': { surface: 'dock', record: staged[0] },
    };
    const derived = deriveArraysFromPlacements(map);
    expect(derived.cards).toHaveLength(1);
    expect(derived.stagedSyncCards).toHaveLength(1);
  });

  it('v2 placements include placement refs and recovery records', () => {
    const cards = [{ id: 'c1', key: 'notes__a', type: 'markdown', x: 1, y: 2, versions: [{ v: 1 }] }];
    const map = buildPlacementsFromArrays(cards, []);
    expect(map['notes__a'].placement?.id).toBe('c1');
    expect(map['notes__a'].record?.id).toBe('c1');
  });

  it('reconcileArtifactPlacements migrates legacy projects', () => {
    const out = reconcileArtifactPlacements({
      cards: [{ id: 'c1', key: 'notes__z', type: 'markdown', versions: [] }],
      stagedSyncCards: [],
    });
    expect(out.placementsMigrated).toBe(true);
    expect(out.artifactPlacements['notes__z'].surface).toBe('canvas');
  });

  it('attachArtifactPlacementsToPayload adds map on save', () => {
    const payload = attachArtifactPlacementsToPayload(
      { cards: [{ id: 'c1', key: 'notes__z', versions: [] }] },
      [],
    );
    expect(payload.artifactPlacementsVersion).toBe(2);
    expect(payload.artifactPlacements['notes__z']).toBeDefined();
  });

  it('applyPlacementMapToArrays moves duplicate on canvas to dock when map says dock', () => {
    const card = { id: 'c1', key: 'notes__dup', type: 'markdown', versions: [] };
    const staged = { stagingId: 's1', key: 'notes__dup', type: 'markdown', versions: [] };
    const out = applyPlacementMapToArrays([card], [], {
      notes__dup: { surface: 'dock', placement: { key: 'notes__dup' } },
    });
    expect(out.cards).toHaveLength(0);
    expect(out.stagedSyncCards).toHaveLength(1);
    expect(out.stagedSyncCards[0].key).toBe('notes__dup');
    expect(out.changed).toBe(true);
  });

  it('reconcileArtifactPlacements prefers placement map over canvas duplicate', () => {
    const card = { id: 'c1', key: 'notes__dup', type: 'markdown', versions: [] };
    const out = reconcileArtifactPlacements({
      cards: [card],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__dup: { surface: 'dock', placement: { key: 'notes__dup' } },
      },
    });
    expect(out.cards).toHaveLength(0);
    expect(out.stagedSyncCards).toHaveLength(1);
    expect(out.artifactPlacements['notes__dup'].surface).toBe('dock');
  });

  it('mergeLocalPlacementStateIntoDoc preserves local dock when server still has canvas card', () => {
    const serverDoc = {
      cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', versions: [] }],
      stagedSyncCards: [],
    };
    const localDoc = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] },
      ],
      artifactPlacements: {
        notes__x: { surface: 'dock', placement: { key: 'notes__x' } },
      },
    };
    const merged = mergeLocalPlacementStateIntoDoc(serverDoc, localDoc);
    expect(merged.cards).toHaveLength(0);
    expect(merged.stagedSyncCards).toHaveLength(1);
    expect(merged.artifactPlacements['notes__x'].surface).toBe('dock');
  });
});
