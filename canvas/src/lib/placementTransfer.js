import {
  canonicalKeyForEntry,
  enforceExclusivePlacement,
} from './artifactPlacement.js';
import {
  applyPlacementMapToArrays,
  attachArtifactPlacementsToPayload,
  buildPlacementRefFromCard,
  buildPlacementsFromArrays,
  patchPlacementsMapFromArrays,
} from './artifactPlacementsMap.js';
import { mergePersistedCardsIntoCanvas } from './canvasCardMerge.js';
import { dockCardFromCanvas, placeStagedCardOnCanvas } from './syncStaging.js';
import { auditPlacementStep } from './placementAudit.js';

/**
 * @param {object[] | undefined} staged
 * @param {object[] | undefined} persistedStaged
 * @param {{ preferLiveMembership?: boolean, authoritativePersisted?: boolean }} [options]
 */
export function mergePersistedStagedIntoDock(
  staged,
  persistedStaged,
  { preferLiveMembership = false, authoritativePersisted = false } = {},
) {
  const live = staged ?? [];
  const persisted = persistedStaged ?? [];

  if (authoritativePersisted) {
    return persisted.length > 0 ? [...persisted] : live;
  }

  if (persisted.length === 0) return live;

  if (live.length === 0) {
    return preferLiveMembership ? [] : persisted;
  }

  const persistedByStagingId = new Map(
    persisted.map((s) => [s.stagingId, s]),
  );
  const persistedByKey = new Map(
    persisted.map((s) => [canonicalKeyForEntry(s), s]),
  );

  const liveIsDeletionSubset =
    live.length < persisted.length
    && live.every((s) => persistedByStagingId.has(s.stagingId));

  if (liveIsDeletionSubset) {
    return live.map(
      (s) => persistedByStagingId.get(s.stagingId) ?? s,
    );
  }

  const merged = [];
  const usedPersistedIds = new Set();

  for (const liveRow of live) {
    const saved =
      persistedByStagingId.get(liveRow.stagingId)
      ?? persistedByKey.get(canonicalKeyForEntry(liveRow));
    if (saved) {
      merged.push(saved);
      usedPersistedIds.add(saved.stagingId);
    } else {
      merged.push(liveRow);
    }
  }

  const liveHasUnsavedRows =
    live.some((s) => !persistedByStagingId.has(s.stagingId))
    || live.length > persisted.length;

  if (!liveHasUnsavedRows) {
    for (const saved of persisted) {
      if (!usedPersistedIds.has(saved.stagingId)) merged.push(saved);
    }
  }

  return merged;
}

/**
 * True when live React state reflects dock→canvas (or canvas→dock) not yet in persisted snapshot.
 */
export function hasLivePlacementAhead(
  liveCards,
  persistedCards,
  liveStaged,
  persistedStaged,
) {
  const liveCanvasKeys = new Set(
    (liveCards ?? []).map((c) => canonicalKeyForEntry(c)).filter(Boolean),
  );
  for (const row of persistedStaged ?? []) {
    const k = canonicalKeyForEntry(row);
    if (k && liveCanvasKeys.has(k)) return true;
  }

  const liveDockKeys = new Set(
    (liveStaged ?? []).map((s) => canonicalKeyForEntry(s)).filter(Boolean),
  );
  for (const card of persistedCards ?? []) {
    const k = canonicalKeyForEntry(card);
    if (k && liveDockKeys.has(k)) return true;
  }

  if ((liveCards ?? []).length > (persistedCards ?? []).length) return true;
  if ((liveStaged ?? []).length < (persistedStaged ?? []).length) return true;
  return false;
}

/**
 * @param {Record<string, object> | null | undefined} localMap
 * @param {Record<string, object> | null | undefined} serverMap
 */
export function placementMapDiffers(localMap, serverMap) {
  const local = localMap ?? {};
  const server = serverMap ?? {};
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
  for (const key of keys) {
    if ((local[key]?.surface ?? null) !== (server[key]?.surface ?? null)) {
      return true;
    }
  }
  return false;
}

/**
 * Merge persisted project placement into live canvas + dock without undoing transfers.
 */
export function mergePersistedPlacementState(
  liveCards,
  liveStaged,
  persistedCards,
  persistedStaged,
  options = {},
) {
  const { enforceOpts, ...mergeOpts } = options;
  const mergedCards = mergePersistedCardsIntoCanvas(
    liveCards,
    persistedCards,
    mergeOpts,
  );
  const mergedStaged = mergePersistedStagedIntoDock(
    liveStaged,
    persistedStaged,
    mergeOpts,
  );

  const liveCanvasKeys = new Set(
    (liveCards ?? []).map((c) => canonicalKeyForEntry(c)).filter(Boolean),
  );
  const liveDockKeys = new Set(
    (liveStaged ?? []).map((s) => canonicalKeyForEntry(s)).filter(Boolean),
  );

  let cards = mergedCards;
  let staged = mergedStaged;

  if (liveCanvasKeys.size > 0) {
    staged = staged.filter((s) => {
      const k = canonicalKeyForEntry(s);
      return !k || !liveCanvasKeys.has(k);
    });
  }
  if (liveDockKeys.size > 0) {
    cards = cards.filter((c) => {
      const k = canonicalKeyForEntry(c);
      return !k || !liveDockKeys.has(k);
    });
  }

  const enforced = enforceExclusivePlacement(cards, staged, enforceOpts ?? {});
  return {
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    changed: enforced.changed,
  };
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {Record<string, object> | null} artifactPlacements
 */
function placementMapFromState(cards, stagedSyncCards, artifactPlacements) {
  if (
    artifactPlacements
    && typeof artifactPlacements === 'object'
    && Object.keys(artifactPlacements).length > 0
  ) {
    return { ...artifactPlacements };
  }
  return buildPlacementsFromArrays(cards, stagedSyncCards);
}

/**
 * Apply map surfaces without dropping array rows missing from a partial map.
 * @param {Record<string, object>} map
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
function viewsFromPlacementMap(map, cards, stagedSyncCards) {
  const patchedMap = patchPlacementsMapFromArrays(
    map ?? {},
    cards ?? [],
    stagedSyncCards ?? [],
  );
  const aligned = applyPlacementMapToArrays(
    cards ?? [],
    stagedSyncCards ?? [],
    patchedMap,
  );
  const enforced = enforceExclusivePlacement(
    aligned.cards,
    aligned.stagedSyncCards,
  );
  return {
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    artifactPlacements: patchPlacementsMapFromArrays(
      patchedMap,
      enforced.cards,
      enforced.stagedSyncCards,
    ),
  };
}

/**
 * Dock chip → canvas card. Updates artifactPlacements first, then derives arrays.
 * @param {Record<string, object> | null} [artifactPlacements]
 */
export function transferStagedToCanvas(
  cards,
  stagedSyncCards,
  stagingId,
  worldX,
  worldY,
  artifactPlacements = null,
) {
  const staged = (stagedSyncCards ?? []).find((s) => s.stagingId === stagingId);
  if (!staged) {
    return {
      placed: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      artifactPlacements: null,
    };
  }

  const key = canonicalKeyForEntry(staged);
  if (!key) {
    return {
      placed: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      artifactPlacements: null,
    };
  }

  const placed = placeStagedCardOnCanvas(cards ?? [], staged, worldX, worldY);
  if (!placed.placed) {
    return {
      placed: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      artifactPlacements: null,
    };
  }

  const canvasCard = placed.movedExisting
    ? placed.cards.find((c) => canonicalKeyForEntry(c) === key)
    : placed.cards[placed.cards.length - 1];

  if (!canvasCard) {
    return {
      placed: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      artifactPlacements: null,
    };
  }

  const map = placementMapFromState(cards, stagedSyncCards, artifactPlacements);
  map[key] = {
    surface: 'canvas',
    placement: buildPlacementRefFromCard(canvasCard),
    record: canvasCard,
  };

  const remainingStaged = (stagedSyncCards ?? []).filter(
    (s) => s.stagingId !== stagingId,
  );
  const views = viewsFromPlacementMap(map, placed.cards, remainingStaged);
  const result = {
    placed: true,
    movedExisting: placed.movedExisting,
    ...views,
  };
  auditPlacementStep('transfer:stagedToCanvas', {
    cards: result.cards,
    stagedSyncCards: result.stagedSyncCards,
    artifactPlacements: result.artifactPlacements,
  });
  return result;
}

/**
 * Canvas card → sync dock. Updates artifactPlacements first, then derives arrays.
 * @param {Record<string, object> | null} [artifactPlacements]
 */
export function transferCardToDock(
  cards,
  stagedSyncCards,
  cardId,
  artifactPlacements = null,
) {
  const result = dockCardFromCanvas(cards, stagedSyncCards, cardId);
  if (!result.docked || !result.staged) {
    return {
      docked: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      staged: null,
      artifactPlacements: null,
    };
  }

  const key = canonicalKeyForEntry(result.staged);
  if (!key) {
    return {
      docked: false,
      cards: cards ?? [],
      stagedSyncCards: stagedSyncCards ?? [],
      staged: null,
      artifactPlacements: null,
    };
  }

  const map = placementMapFromState(cards, stagedSyncCards, artifactPlacements);
  map[key] = {
    surface: 'dock',
    placement: buildPlacementRefFromCard(result.staged),
    record: result.staged,
  };

  const views = viewsFromPlacementMap(
    map,
    result.cards,
    result.stagedCards,
  );
  const out = {
    docked: true,
    staged: result.staged,
    ...views,
  };
  auditPlacementStep('transfer:cardToDock', {
    cards: out.cards,
    stagedSyncCards: out.stagedSyncCards,
    artifactPlacements: out.artifactPlacements,
  });
  return out;
}
