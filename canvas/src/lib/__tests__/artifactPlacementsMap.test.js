import { describe, it, expect } from 'vitest';
import {
  buildPlacementsFromArrays,
  buildPayloadFromAuthoritativePlacements,
  deriveArraysFromPlacements,
  reconcileArtifactPlacements,
  attachArtifactPlacementsToPayload,
  applyPlacementMapToArrays,
  applyPlacementMapToArraysSparse,
  mergeLocalPlacementStateIntoDoc,
  localPlacementShouldWin,
  patchPlacementsMapFromArrays,
} from '../artifactPlacementsMap.js';
import { buildProjectSavePayload } from '../persistence.js';

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

  it('buildPayloadFromAuthoritativePlacements keeps canvas when map says canvas but arrays are dock-only', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__a',
        type: 'markdown',
        versions: [{ version: 1, filename: 'notes__a-v1.md' }],
      },
    ];
    const card = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 10,
      y: 20,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const map = {
      notes__a: {
        surface: 'canvas',
        placement: { key: 'notes__a', x: 10, y: 20 },
        record: card,
      },
    };
    const out = buildPayloadFromAuthoritativePlacements([], staged, map);
    expect(out.cards).toHaveLength(1);
    expect(out.stagedSyncCards).toHaveLength(0);
    expect(out.artifactPlacements.notes__a.surface).toBe('canvas');
  });

  it('buildProjectSavePayload syncs arrays from authoritative map', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__b',
        type: 'markdown',
        versions: [{ version: 1, filename: 'notes__b-v1.md' }],
      },
    ];
    const card = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 5,
      y: 6,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const authoritativePlacements = {
      notes__a: { surface: 'canvas', record: card, placement: { key: 'notes__a', x: 5, y: 6 } },
      notes__b: { surface: 'dock', record: staged[0] },
    };
    const payload = buildProjectSavePayload(
      { projectName: 'P', cards: [], canvasView: { x: 0, y: 0, zoom: 1 } },
      staged,
      [],
      { authoritativePlacements },
    );
    expect(payload.cards).toHaveLength(1);
    expect(payload.stagedSyncCards).toHaveLength(1);
    expect(payload.artifactPlacements.notes__a.surface).toBe('canvas');
    expect(payload.artifactPlacements.notes__b.surface).toBe('dock');
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

  it('reconcileArtifactPlacements keeps canvas arrays when map says dock', () => {
    const card = {
      id: 'c1',
      key: 'notes__dup',
      type: 'markdown',
      x: 120,
      y: 80,
      versions: [{ version: 1, filename: 'notes__dup-v1.md' }],
    };
    const staged = {
      stagingId: 's1',
      key: 'notes__dup',
      type: 'markdown',
      versions: [{ version: 1, filename: 'notes__dup-v1.md' }],
    };
    const out = reconcileArtifactPlacements({
      cards: [card],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__dup: { surface: 'dock', placement: { key: 'notes__dup' }, record: staged },
      },
    });
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].id).toBe('c1');
    expect(out.artifactPlacements['notes__dup'].surface).toBe('canvas');
  });

  it('applyPlacementMapToArraysSparse skips keys already on canvas', () => {
    const card = { id: 'c1', key: 'notes__a', type: 'markdown', versions: [] };
    const out = applyPlacementMapToArraysSparse([card], [], {
      notes__a: { surface: 'dock' },
    });
    expect(out.cards).toHaveLength(1);
    expect(out.stagedSyncCards).toHaveLength(0);
    expect(out.changed).toBe(false);
  });

  it('localPlacementShouldWin when local canvas but server has dock only', () => {
    const wins = localPlacementShouldWin(
      {
        cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', x: 10, y: 20, versions: [] }],
        stagedSyncCards: [],
      },
      {
        cards: [],
        stagedSyncCards: [
          { stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] },
        ],
      },
      0,
      1000,
    );
    expect(wins).toBe(true);
  });

  it('localPlacementShouldWin false when server canvas is newer than stale local dock', () => {
    const wins = localPlacementShouldWin(
      {
        cards: [],
        stagedSyncCards: [{ stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] }],
        artifactPlacements: { notes__x: { surface: 'dock' } },
      },
      {
        cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', versions: [] }],
        stagedSyncCards: [],
        artifactPlacements: {
          notes__x: { surface: 'canvas', placement: { key: 'notes__x' } },
        },
      },
      0,
      1000,
    );
    expect(wins).toBe(false);
  });

  it('localPlacementShouldWin when local dock move is newer than server canvas', () => {
    const wins = localPlacementShouldWin(
      {
        cards: [],
        stagedSyncCards: [{ stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] }],
        artifactPlacements: { notes__x: { surface: 'dock' } },
      },
      {
        cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', versions: [] }],
        stagedSyncCards: [],
      },
      2000,
      1000,
    );
    expect(wins).toBe(true);
  });

  it('mergeLocalPlacementStateIntoDoc prefers canvas arrays over stale local dock map', () => {
    const serverDoc = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] },
      ],
      artifactPlacements: {
        notes__x: { surface: 'dock' },
      },
    };
    const localDoc = {
      cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', x: 50, y: 60, versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__x: {
          surface: 'dock',
          record: { stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] },
        },
      },
    };
    const merged = mergeLocalPlacementStateIntoDoc(serverDoc, localDoc);
    expect(merged.cards).toHaveLength(1);
    expect(merged.stagedSyncCards).toHaveLength(0);
    expect(merged.artifactPlacements.notes__x.surface).toBe('canvas');
  });

  it('mergeLocalPlacementStateIntoDoc preserves local canvas when server has dock only', () => {
    const serverDoc = {
      cards: [],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__x', type: 'markdown', versions: [] },
      ],
    };
    const localDoc = {
      cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', x: 50, y: 60, versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__x: { surface: 'canvas', placement: { key: 'notes__x', x: 50, y: 60 } },
      },
    };
    const merged = mergeLocalPlacementStateIntoDoc(serverDoc, localDoc);
    expect(merged.cards).toHaveLength(1);
    expect(merged.stagedSyncCards).toHaveLength(0);
    expect(merged.artifactPlacements['notes__x'].surface).toBe('canvas');
  });

  it('patchPlacementsMapFromArrays keeps canvas surface from arrays', () => {
    const card = {
      id: 'c1',
      key: 'notes__a',
      type: 'markdown',
      x: 1,
      y: 2,
      versions: [{ version: 1, filename: 'notes__a-v1.md' }],
    };
    const map = patchPlacementsMapFromArrays(
      { notes__a: { surface: 'dock', record: { stagingId: 's1' } } },
      [card],
      [],
    );
    expect(map.notes__a.surface).toBe('canvas');
    expect(map.notes__a.record.id).toBe('c1');
  });

  it('mergeLocalPlacementStateIntoDoc keeps server canvas when local dock is stale', () => {
    const serverDoc = {
      cards: [{ id: 'c1', key: 'notes__x', type: 'markdown', versions: [] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__x: { surface: 'canvas', placement: { key: 'notes__x' } },
      },
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
    expect(merged.cards).toHaveLength(1);
    expect(merged.stagedSyncCards).toHaveLength(0);
    expect(merged.artifactPlacements['notes__x'].surface).toBe('canvas');
  });

});
