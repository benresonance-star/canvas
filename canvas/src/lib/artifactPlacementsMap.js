import { canonicalKeyForEntry, enforceExclusivePlacement } from './artifactPlacement.js';
import { canvasCardToStaged, stagedSyncCardToCanvasCard } from './syncStaging.js';

export const ARTIFACT_PLACEMENTS_VERSION = 2;

/**
 * @param {object} card
 */
export function buildPlacementRefFromCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    key: card.key,
    type: card.type,
    prefix: card.prefix,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    pinnedVersion: card.pinnedVersion,
    ...(card.stagingId ? { stagingId: card.stagingId } : {}),
  };
}

function isV1PlacementEntry(entry) {
  return Boolean(entry?.record && !entry?.placement);
}

/**
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
export function buildPlacementsFromArrays(cards, stagedSyncCards) {
  const map = {};
  for (const card of cards ?? []) {
    const key = canonicalKeyForEntry(card);
    if (!key || map[key]) continue;
    map[key] = {
      surface: 'canvas',
      placement: buildPlacementRefFromCard(card),
      record: card,
    };
  }
  for (const staged of stagedSyncCards ?? []) {
    const key = canonicalKeyForEntry(staged);
    if (!key || map[key]) continue;
    map[key] = {
      surface: 'dock',
      placement: buildPlacementRefFromCard(staged),
      record: staged,
    };
  }
  return map;
}

/**
 * Legacy v1: full records in map. v2: placement refs only — use only when arrays empty.
 * @param {Record<string, object>} artifactPlacements
 */
export function deriveArraysFromPlacements(artifactPlacements) {
  const cards = [];
  const stagedSyncCards = [];
  for (const entry of Object.values(artifactPlacements ?? {})) {
    const record = entry?.record ?? null;
    if (!record) continue;
    if (entry.surface === 'dock') stagedSyncCards.push(record);
    else cards.push(record);
  }
  return { cards, stagedSyncCards };
}

/**
 * @param {object[]} entries
 * @param {string} key
 */
function findEntryByCanonicalKey(entries, key) {
  return (entries ?? []).find((e) => canonicalKeyForEntry(e) === key) ?? null;
}

/**
 * Align canvas/dock arrays with saved placement map before duplicate resolution.
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {Record<string, { surface?: string, placement?: object, record?: object }>} artifactPlacements
 */
export function applyPlacementMapToArrays(cards, stagedSyncCards, artifactPlacements) {
  if (
    !artifactPlacements
    || typeof artifactPlacements !== 'object'
    || Array.isArray(artifactPlacements)
  ) {
    return {
      cards: [...(cards ?? [])],
      stagedSyncCards: [...(stagedSyncCards ?? [])],
      changed: false,
    };
  }

  let nextCards = [...(cards ?? [])];
  let nextStaged = [...(stagedSyncCards ?? [])];
  let changed = false;

  for (const [key, entry] of Object.entries(artifactPlacements)) {
    if (!key || !entry?.surface) continue;

    const canvasEntry = findEntryByCanonicalKey(nextCards, key);
    const stagedEntry = findEntryByCanonicalKey(nextStaged, key);

    if (entry.surface === 'dock') {
      if (canvasEntry) {
        nextCards = nextCards.filter((c) => canonicalKeyForEntry(c) !== key);
        changed = true;
        if (!stagedEntry) {
          nextStaged.push(canvasCardToStaged(canvasEntry));
          changed = true;
        }
      }
      continue;
    }

    if (entry.surface === 'canvas' && stagedEntry && !canvasEntry) {
      nextStaged = nextStaged.filter((s) => canonicalKeyForEntry(s) !== key);
      changed = true;
      const ref = entry.placement ?? entry.record ?? stagedEntry;
      const x = (ref.x ?? 0) + 50;
      const y = (ref.y ?? 0) + 50;
      nextCards.push(stagedSyncCardToCanvasCard(stagedEntry, x, y));
    }
  }

  return { cards: nextCards, stagedSyncCards: nextStaged, changed };
}

/**
 * Merge local dock placements into a server-fetched document (e.g. boot force-pull).
 * @param {object | null} serverDoc
 * @param {object | null} localDoc
 */
export function mergeLocalPlacementStateIntoDoc(serverDoc, localDoc) {
  if (!serverDoc) return localDoc ?? null;
  if (!localDoc) return serverDoc;

  let cards = [...(serverDoc.cards ?? [])];
  let staged = [...(serverDoc.stagedSyncCards ?? [])];

  const dockKeys = new Set();
  for (const s of localDoc.stagedSyncCards ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k) dockKeys.add(k);
  }
  const localPlacements = localDoc.artifactPlacements ?? {};
  for (const [key, entry] of Object.entries(localPlacements)) {
    if (entry?.surface === 'dock') dockKeys.add(key);
  }

  for (const key of dockKeys) {
    const localStaged =
      findEntryByCanonicalKey(localDoc.stagedSyncCards, key)
      ?? findEntryByCanonicalKey(localDoc.cards, key);
    if (!localStaged) continue;

    cards = cards.filter((c) => canonicalKeyForEntry(c) !== key);
    const stagedPayload = localStaged.stagingId
      ? localStaged
      : canvasCardToStaged(localStaged);
    const idx = staged.findIndex((s) => canonicalKeyForEntry(s) === key);
    if (idx >= 0) {
      staged[idx] = stagedPayload;
    } else {
      staged.push(stagedPayload);
    }
  }

  const aligned = applyPlacementMapToArrays(
    cards,
    staged,
    localPlacements,
  );

  return {
    ...serverDoc,
    cards: aligned.cards,
    stagedSyncCards: aligned.stagedSyncCards,
    artifactPlacements: buildPlacementsFromArrays(
      aligned.cards,
      aligned.stagedSyncCards,
    ),
    artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
  };
}

/**
 * @param {object} data normalized project document
 * @param {{ threads?: object[], preferredCardId?: string | null }} [opts]
 */
export function reconcileArtifactPlacements(data, opts = {}) {
  if (!data) return data;

  const placements = data.artifactPlacements;
  const hasMap =
    placements
    && typeof placements === 'object'
    && !Array.isArray(placements)
    && Object.keys(placements).length > 0;

  let cards = data.cards ?? [];
  let stagedSyncCards = data.stagedSyncCards ?? [];
  let mapAppliedChanged = false;

  if (hasMap) {
    const aligned = applyPlacementMapToArrays(cards, stagedSyncCards, placements);
    cards = aligned.cards;
    stagedSyncCards = aligned.stagedSyncCards;
    mapAppliedChanged = aligned.changed;
  }

  const enforced = enforceExclusivePlacement(
    cards,
    stagedSyncCards,
    { threads: opts.threads ?? [], preferredCardId: opts.preferredCardId },
  );

  const arraysEmpty =
    enforced.cards.length === 0 && enforced.stagedSyncCards.length === 0;

  if (hasMap && arraysEmpty) {
    const hasRecords = Object.values(placements).some(
      (e) => e?.record && typeof e.record === 'object',
    );
    if (hasRecords) {
      const derived = deriveArraysFromPlacements(placements);
      const reEnforced = enforceExclusivePlacement(
        derived.cards,
        derived.stagedSyncCards,
        opts,
      );
      return {
        ...data,
        cards: reEnforced.cards,
        stagedSyncCards: reEnforced.stagedSyncCards,
        artifactPlacements: buildPlacementsFromArrays(
          reEnforced.cards,
          reEnforced.stagedSyncCards,
        ),
        artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
        placementsReconciled: enforced.changed || reEnforced.changed,
        placementsMigrated: true,
      };
    }
  }

  const map = buildPlacementsFromArrays(enforced.cards, enforced.stagedSyncCards);
  const migratedFromLegacy = hasMap && !arraysEmpty
    && Object.values(placements).some(isV1PlacementEntry);

  return {
    ...data,
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    artifactPlacements: map,
    artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
    ...(migratedFromLegacy || !hasMap ? { placementsMigrated: true } : {}),
    placementsReconciled: enforced.changed || mapAppliedChanged,
  };
}

/**
 * @param {object} payload stateForPersist output + staged
 */
export function attachArtifactPlacementsToPayload(payload, stagedSyncCards = []) {
  const enforced = enforceExclusivePlacement(payload.cards ?? [], stagedSyncCards ?? []);
  const cards = enforced.cards;
  const staged = enforced.stagedSyncCards;
  return {
    ...payload,
    cards,
    stagedSyncCards: staged,
    artifactPlacements: buildPlacementsFromArrays(cards, staged),
    artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
  };
}
