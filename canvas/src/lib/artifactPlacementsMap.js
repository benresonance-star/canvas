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
/**
 * Align arrays and map from an authoritative placement map (single write source).
 * @param {object[]} baseCards
 * @param {object[]} baseStaged
 * @param {Record<string, object>} authoritativePlacements
 * @param {{ preferredCardId?: string | null, threads?: object[] }} [enforceOpts]
 */
export function buildPayloadFromAuthoritativePlacements(
  baseCards,
  baseStaged,
  authoritativePlacements,
  enforceOpts = {},
) {
  const map = authoritativePlacements ?? {};
  const allHaveRecords = Object.values(map).every(
    (e) => e?.record && typeof e.record === 'object',
  );

  let cards;
  let stagedSyncCards;
  if (allHaveRecords) {
    const derived = deriveArraysFromPlacements(map);
    cards = mergePlacementCoordsFromMap(derived.cards, map);
    stagedSyncCards = derived.stagedSyncCards;
  } else {
    const aligned = applyPlacementMapToArrays(
      baseCards ?? [],
      baseStaged ?? [],
      map,
    );
    cards = mergePlacementCoordsFromMap(aligned.cards, map);
    stagedSyncCards = aligned.stagedSyncCards;
  }

  const enforced = enforceExclusivePlacement(cards, stagedSyncCards, enforceOpts);
  const artifactPlacements = patchPlacementsMapFromArrays(
    map,
    enforced.cards,
    enforced.stagedSyncCards,
  );

  return {
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    artifactPlacements,
    artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
  };
}

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
 * Canonical keys present on canvas or dock arrays.
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
function occupiedPlacementKeys(cards, stagedSyncCards) {
  const keys = new Set();
  for (const c of cards ?? []) {
    const k = canonicalKeyForEntry(c);
    if (k) keys.add(k);
  }
  for (const s of stagedSyncCards ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k) keys.add(k);
  }
  return keys;
}

/**
 * Apply map entries only for keys not already on canvas or dock (arrays are authoritative).
 */
export function applyPlacementMapToArraysSparse(cards, stagedSyncCards, artifactPlacements) {
  if (
    !artifactPlacements
    || typeof artifactPlacements !== 'object'
    || Array.isArray(artifactPlacements)
  ) {
    return applyPlacementMapToArrays(cards, stagedSyncCards, artifactPlacements);
  }
  const occupied = occupiedPlacementKeys(cards, stagedSyncCards);
  const sparse = {};
  for (const [key, entry] of Object.entries(artifactPlacements)) {
    if (!occupied.has(key)) sparse[key] = entry;
  }
  return applyPlacementMapToArrays(cards, stagedSyncCards, sparse);
}

/**
 * Copy x/y from v2 placement refs when the canvas card has no coordinates.
 * @param {object[]} cards
 * @param {Record<string, { placement?: { x?: number, y?: number } }>} artifactPlacements
 */
export function mergePlacementCoordsFromMap(cards, artifactPlacements) {
  if (!artifactPlacements || typeof artifactPlacements !== 'object') {
    return cards ?? [];
  }
  let changed = false;
  const next = (cards ?? []).map((card) => {
    const key = canonicalKeyForEntry(card);
    const ref = key ? artifactPlacements[key]?.placement : null;
    if (!ref || (card.x != null && card.y != null)) return card;
    if (ref.x == null && ref.y == null) return card;
    changed = true;
    return {
      ...card,
      x: ref.x ?? card.x ?? 0,
      y: ref.y ?? card.y ?? 0,
    };
  });
  return changed ? next : cards ?? [];
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
 * True when local document has dock/placement authority over server (e.g. after F5).
 * @param {object | null} localDoc
 * @param {object | null} serverDoc
 * @param {number} localEditAt
 * @param {number} serverAt
 */
export function localPlacementShouldWin(localDoc, serverDoc, localEditAt, serverAt) {
  if (!localDoc) return false;
  if (localEditAt > serverAt) return true;

  const serverMap = patchPlacementsMapFromArrays(
    serverDoc?.artifactPlacements ?? {},
    serverDoc?.cards ?? [],
    serverDoc?.stagedSyncCards ?? [],
  );

  const serverCards = serverDoc?.cards ?? [];
  const serverStaged = serverDoc?.stagedSyncCards ?? [];
  const localCards = localDoc.cards ?? [];

  const hasOnServerCanvas = (key) =>
    serverCards.some((c) => canonicalKeyForEntry(c) === key);
  const hasOnServerDock = (key) =>
    serverStaged.some((s) => canonicalKeyForEntry(s) === key);
  const hasOnLocalCanvas = (key) =>
    localCards.some((c) => canonicalKeyForEntry(c) === key);
  const hasOnLocalDock = (key) =>
    (localDoc.stagedSyncCards ?? []).some((s) => canonicalKeyForEntry(s) === key);

  /** Server already committed canvas placement (e.g. other browser) — do not keep stale dock-only local. */
  const serverCanvasAuthoritative = (key) =>
    serverMap[key]?.surface === 'canvas' && hasOnServerCanvas(key);

  for (const c of localCards) {
    const k = canonicalKeyForEntry(c);
    if (k && !hasOnServerCanvas(k) && hasOnServerDock(k)) return true;
  }

  for (const [key, entry] of Object.entries(localDoc.artifactPlacements ?? {})) {
    if (entry?.surface === 'dock' && hasOnServerCanvas(key)) {
      if (serverCanvasAuthoritative(key)) continue;
      if (hasOnLocalDock(key)) return true;
    }
    if (entry?.surface === 'canvas' && hasOnLocalCanvas(key) && hasOnServerDock(key)) {
      return true;
    }
  }
  for (const s of localDoc.stagedSyncCards ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k && hasOnServerCanvas(k)) {
      if (serverCanvasAuthoritative(k)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Merge local dock placements into a server-fetched document (e.g. boot force-pull).
 * @param {object | null} serverDoc
 * @param {object | null} localDoc
 */
export function mergeLocalPlacementStateIntoDoc(serverDoc, localDoc) {
  if (!serverDoc) return localDoc ?? null;
  if (!localDoc) return serverDoc;

  const serverMap = patchPlacementsMapFromArrays(
    serverDoc.artifactPlacements ?? {},
    serverDoc.cards ?? [],
    serverDoc.stagedSyncCards ?? [],
  );
  const localMap = patchPlacementsMapFromArrays(
    localDoc.artifactPlacements ?? {},
    localDoc.cards ?? [],
    localDoc.stagedSyncCards ?? [],
  );

  const mergedMap = { ...serverMap };
  for (const [key, localEntry] of Object.entries(localMap)) {
    if (!key || !localEntry?.surface) continue;
    const serverEntry = serverMap[key];
    const serverHasCanvasCard = (serverDoc.cards ?? []).some(
      (c) => canonicalKeyForEntry(c) === key,
    );
    if (
      localEntry.surface === 'dock'
      && serverEntry?.surface === 'canvas'
      && serverHasCanvasCard
    ) {
      continue;
    }
    mergedMap[key] = {
      ...(serverEntry ?? {}),
      ...localEntry,
      surface: localEntry.surface,
      record: localEntry.record ?? serverEntry?.record,
      placement: localEntry.placement ?? serverEntry?.placement,
    };
  }

  if (Object.keys(mergedMap).length === 0) {
    return {
      ...serverDoc,
      cards: [...(serverDoc.cards ?? [])],
      stagedSyncCards: [...(serverDoc.stagedSyncCards ?? [])],
      artifactPlacements: buildPlacementsFromArrays(
        serverDoc.cards,
        serverDoc.stagedSyncCards,
      ),
      artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
    };
  }

  const allHaveRecords = Object.values(mergedMap).every(
    (e) => e?.record && typeof e.record === 'object',
  );
  let cards;
  let stagedSyncCards;
  if (allHaveRecords) {
    const derived = deriveArraysFromPlacements(mergedMap);
    cards = mergePlacementCoordsFromMap(derived.cards, mergedMap);
    stagedSyncCards = derived.stagedSyncCards;
  } else {
    const aligned = applyPlacementMapToArrays(
      serverDoc.cards ?? [],
      serverDoc.stagedSyncCards ?? [],
      mergedMap,
    );
    cards = mergePlacementCoordsFromMap(aligned.cards, mergedMap);
    stagedSyncCards = aligned.stagedSyncCards;
  }

  const mapKeys = new Set(Object.keys(mergedMap));
  const extraCards = (serverDoc.cards ?? []).filter((c) => {
    const k = canonicalKeyForEntry(c);
    return !k || !mapKeys.has(k);
  });
  const extraLocalCards = (localDoc.cards ?? []).filter((c) => {
    const k = canonicalKeyForEntry(c);
    return !k || !mapKeys.has(k);
  });
  const extraStaged = (serverDoc.stagedSyncCards ?? []).filter((s) => {
    const k = canonicalKeyForEntry(s);
    return !k || !mapKeys.has(k);
  });
  const extraLocalStaged = (localDoc.stagedSyncCards ?? []).filter((s) => {
    const k = canonicalKeyForEntry(s);
    return !k || !mapKeys.has(k);
  });

  cards = [...cards, ...extraCards, ...extraLocalCards];
  stagedSyncCards = [...stagedSyncCards, ...extraStaged, ...extraLocalStaged];

  const enforced = enforceExclusivePlacement(cards, stagedSyncCards);

  return {
    ...serverDoc,
    cards: enforced.cards,
    stagedSyncCards: enforced.stagedSyncCards,
    artifactPlacements: patchPlacementsMapFromArrays(
      mergedMap,
      enforced.cards,
      enforced.stagedSyncCards,
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

  const arraysEmpty =
    (cards?.length ?? 0) === 0 && (stagedSyncCards?.length ?? 0) === 0;

  if (hasMap) {
    const allHaveRecords = Object.values(placements).every(
      (e) => e?.record && typeof e.record === 'object',
    );
    if (allHaveRecords && arraysEmpty) {
      const derived = deriveArraysFromPlacements(placements);
      cards = derived.cards;
      stagedSyncCards = derived.stagedSyncCards;
      cards = mergePlacementCoordsFromMap(cards, placements);
      mapAppliedChanged = true;
    } else if (arraysEmpty) {
      const aligned = applyPlacementMapToArrays(cards, stagedSyncCards, placements);
      cards = aligned.cards;
      stagedSyncCards = aligned.stagedSyncCards;
      cards = mergePlacementCoordsFromMap(cards, placements);
      mapAppliedChanged = aligned.changed || true;
    } else {
      cards = mergePlacementCoordsFromMap(cards, placements);
    }
  }

  const enforced = enforceExclusivePlacement(
    cards,
    stagedSyncCards,
    { threads: opts.threads ?? [], preferredCardId: opts.preferredCardId },
  );

  const enforcedEmpty =
    enforced.cards.length === 0 && enforced.stagedSyncCards.length === 0;

  if (hasMap && enforcedEmpty && arraysEmpty) {
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

  const map = hasMap
    ? patchPlacementsMapFromArrays(
      placements,
      enforced.cards,
      enforced.stagedSyncCards,
    )
    : buildPlacementsFromArrays(enforced.cards, enforced.stagedSyncCards);
  const migratedFromLegacy = hasMap && !enforcedEmpty
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
 * Sync map entries from enforced arrays without discarding map-only metadata.
 * @param {Record<string, object>} placements
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 */
export function patchPlacementsMapFromArrays(placements, cards, stagedSyncCards) {
  const next = { ...(placements ?? {}) };
  for (const card of cards ?? []) {
    const key = canonicalKeyForEntry(card);
    if (!key) continue;
    next[key] = {
      surface: 'canvas',
      placement: buildPlacementRefFromCard(card),
      record: card,
    };
  }
  for (const staged of stagedSyncCards ?? []) {
    const key = canonicalKeyForEntry(staged);
    if (!key) continue;
    next[key] = {
      surface: 'dock',
      placement: buildPlacementRefFromCard(staged),
      record: staged,
    };
  }
  const liveKeys = new Set();
  for (const c of cards ?? []) {
    const k = canonicalKeyForEntry(c);
    if (k) liveKeys.add(k);
  }
  for (const s of stagedSyncCards ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k) liveKeys.add(k);
  }
  for (const key of Object.keys(next)) {
    if (!liveKeys.has(key)) delete next[key];
  }
  return next;
}

/**
 * @param {object} payload stateForPersist output + staged
 */
export function attachArtifactPlacementsToPayload(
  payload,
  stagedSyncCards = [],
  { existingPlacements = null } = {},
) {
  const enforced = enforceExclusivePlacement(payload.cards ?? [], stagedSyncCards ?? []);
  const cards = enforced.cards;
  const staged = enforced.stagedSyncCards;
  const hasExisting =
    existingPlacements
    && typeof existingPlacements === 'object'
    && Object.keys(existingPlacements).length > 0;
  const artifactPlacements = hasExisting
    ? patchPlacementsMapFromArrays(existingPlacements, cards, staged)
    : buildPlacementsFromArrays(cards, staged);
  return {
    ...payload,
    cards,
    stagedSyncCards: staged,
    artifactPlacements,
    artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
  };
}
