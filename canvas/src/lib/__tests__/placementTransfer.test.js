import { describe, it, expect } from 'vitest';
import {
  mergePersistedStagedIntoDock,
  mergePersistedPlacementState,
  hasLivePlacementAhead,
  placementMapDiffers,
  transferStagedToCanvas,
  transferCardToDock,
} from '../placementTransfer.js';
import { normalizeLoadedProject } from '../persistence.js';

const stagedRow = (stagingId, key) => ({
  stagingId,
  key,
  prefix: 'notes',
  name: 'A',
  type: 'markdown',
  versions: [{ version: 1, filename: `${key}-v1.md` }],
  pinnedVersion: 1,
});

const canvasCard = (id, key, x = 100, y = 100) => ({
  id,
  key,
  prefix: 'notes',
  name: 'A',
  type: 'markdown',
  x,
  y,
  versions: [{ version: 1, filename: `${key}-v1.md` }],
  pinnedVersion: 1,
});

describe('placementTransfer', () => {
  it('transferStagedToCanvas keeps other dock rows when map only tracks one key', () => {
    const staged = [
      stagedRow('s1', 'notes__a'),
      stagedRow('s2', 'notes__b'),
      stagedRow('s3', 'notes__c'),
    ];
    const partialMap = {
      notes__a: {
        surface: 'dock',
        record: staged[0],
      },
    };
    const result = transferStagedToCanvas([], staged, 's1', 120, 80, partialMap);
    expect(result.placed).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.stagedSyncCards).toHaveLength(2);
    expect(result.stagedSyncCards.map((s) => s.key).sort()).toEqual([
      'notes__b',
      'notes__c',
    ]);
    expect(result.artifactPlacements.notes__a.surface).toBe('canvas');
    expect(result.artifactPlacements.notes__b.surface).toBe('dock');
  });

  it('transferStagedToCanvas updates map first and derives arrays', () => {
    const staged = [stagedRow('s1', 'notes__a')];
    const result = transferStagedToCanvas([], staged, 's1', 200, 200);
    expect(result.placed).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.stagedSyncCards).toHaveLength(0);
    expect(result.cards[0].key).toBe('notes__a');
    expect(result.artifactPlacements['notes__a'].surface).toBe('canvas');
    expect(result.artifactPlacements['notes__a'].record?.id).toBe(result.cards[0].id);
  });

  it('transferCardToDock updates map to dock surface', () => {
    const cards = [canvasCard('c1', 'notes__a')];
    const result = transferCardToDock(cards, [], 'c1');
    expect(result.docked).toBe(true);
    expect(result.cards).toHaveLength(0);
    expect(result.stagedSyncCards).toHaveLength(1);
    expect(result.artifactPlacements['notes__a'].surface).toBe('dock');
  });

  it('placementMapDiffers when surface changes', () => {
    expect(
      placementMapDiffers(
        { notes__a: { surface: 'canvas' } },
        { notes__a: { surface: 'dock' } },
      ),
    ).toBe(true);
  });

  it('hasLivePlacementAhead when key moved to canvas in memory', () => {
    const liveCards = [canvasCard('c1', 'notes__a')];
    const persistedStaged = [stagedRow('s1', 'notes__a')];
    expect(
      hasLivePlacementAhead(liveCards, [], [], persistedStaged),
    ).toBe(true);
  });

  it('mergePersistedPlacementState keeps live dock→canvas transfer over stale persisted dock', () => {
    const liveCards = [canvasCard('c1', 'notes__a')];
    const persistedStaged = [stagedRow('s1', 'notes__a')];
    const { cards, stagedSyncCards } = mergePersistedPlacementState(
      liveCards,
      [],
      [],
      persistedStaged,
      { authoritativePersisted: true },
    );
    expect(cards).toHaveLength(1);
    expect(stagedSyncCards).toHaveLength(0);
  });

  it('normalizeLoadedProject preserves saved transfer payload', () => {
    const staged = [stagedRow('s1', 'notes__a')];
    const transfer = transferStagedToCanvas([], staged, 's1', 200, 150);
    const normalized = normalizeLoadedProject({
      projectName: 'P',
      cards: transfer.cards,
      stagedSyncCards: transfer.stagedSyncCards,
      artifactPlacements: transfer.artifactPlacements,
      canvasView: { x: 0, y: 0, zoom: 1 },
    });
    expect(normalized.cards).toHaveLength(1);
    expect(normalized.cards[0].x).toBeDefined();
    expect(normalized.stagedSyncCards).toHaveLength(0);
    expect(normalized.artifactPlacements['notes__a'].surface).toBe('canvas');
  });

  it('mergePersistedStagedIntoDock keeps in-memory dock rows not yet persisted', () => {
    const live = [stagedRow('s-new', 'notes__new')];
    const persisted = [stagedRow('s-old', 'notes__old')];
    const merged = mergePersistedStagedIntoDock(live, persisted, {
      preferLiveMembership: true,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].stagingId).toBe('s-new');
  });
});
