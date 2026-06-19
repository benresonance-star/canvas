import { canonicalKeyForEntry } from './artifactPlacement.js';
import { canvasCardToStaged } from './syncStaging.js';

/**
 * Map canvas card type to spec layout kind.
 * @param {string} type
 */
export function cardTypeToLayoutKind(type) {
  if (type === 'user_note') return 'note';
  if (type === 'bookmark') return 'url';
  return 'resource';
}

/**
 * Build spec canvas_state layout from project JSON payload.
 * @param {object} payload
 */
export function projectPayloadToSpecLayout(payload) {
  const placed = [];
  for (const card of payload?.cards ?? []) {
    const ref = card.versions?.[0]?.artifactRef;
    placed.push({
      kind: cardTypeToLayoutKind(card.type),
      id: ref?.id ?? card.id,
      syncKey: canonicalKeyForEntry(card),
      cardId: card.id,
      x: card.x ?? 0,
      y: card.y ?? 0,
      w: card.width ?? null,
      h: card.height ?? null,
      type: card.type,
      cluster_id: card.clusterId ?? null,
    });
  }

  const staging = [];
  for (const staged of payload?.stagedSyncCards ?? []) {
    staging.push({
      kind: cardTypeToLayoutKind(staged.type),
      id: staged.stagingId,
      syncKey: canonicalKeyForEntry(staged),
      stagingId: staged.stagingId,
      type: staged.type,
    });
  }

  return {
    placed,
    staging,
    artifactPlacements: payload?.artifactPlacements ?? null,
  };
}

/**
 * @param {object} payload
 */
export function projectPayloadToSpecViewport(payload) {
  const view = payload?.canvasView ?? { x: 0, y: 0, zoom: 1 };
  return {
    x: view.x ?? 0,
    y: view.y ?? 0,
    zoom: view.zoom ?? 1,
  };
}

function layoutEntryMap(entries) {
  return new Map(
    (entries ?? [])
      .filter((entry) => entry?.syncKey)
      .map((entry) => [entry.syncKey, entry]),
  );
}

function applyPlacedGeometry(card, placed) {
  return {
    ...card,
    id: placed.cardId ?? card.id,
    x: placed.x ?? card.x ?? 0,
    y: placed.y ?? card.y ?? 0,
    width: placed.w ?? card.width,
    height: placed.h ?? card.height,
    clusterId: placed.cluster_id ?? card.clusterId,
  };
}

function stagedToPlacedCard(staged, placed) {
  return {
    id: placed.cardId ?? crypto.randomUUID(),
    key: staged.key,
    prefix: staged.prefix,
    name: staged.name,
    type: staged.type,
    versions: staged.versions ?? [],
    pinnedVersion: staged.pinnedVersion,
    x: placed.x ?? 0,
    y: placed.y ?? 0,
    width: placed.w ?? undefined,
    height: placed.h ?? undefined,
    ...(placed.cluster_id ? { clusterId: placed.cluster_id } : {}),
    ...(staged.audioSkinColor ? { audioSkinColor: staged.audioSkinColor } : {}),
    ...(staged.minimalPreview ? { minimalPreview: true } : {}),
  };
}

function applySpecSurfaces(payload, layout) {
  const placedByKey = layoutEntryMap(layout.placed);
  const stagedByKey = layoutEntryMap(layout.staging);
  if (placedByKey.size === 0 && stagedByKey.size === 0) {
    return {
      cards: payload.cards ?? [],
      stagedSyncCards: payload.stagedSyncCards ?? [],
    };
  }

  const cards = [];
  const stagedSyncCards = [];
  const handled = new Set();

  for (const card of payload.cards ?? []) {
    const key = canonicalKeyForEntry(card);
    if (key && placedByKey.has(key)) {
      cards.push(applyPlacedGeometry(card, placedByKey.get(key)));
      handled.add(key);
      continue;
    }
    if (key && stagedByKey.has(key)) {
      const staged = canvasCardToStaged(card);
      stagedSyncCards.push({
        ...staged,
        stagingId: stagedByKey.get(key).stagingId ?? staged.stagingId,
      });
      handled.add(key);
      continue;
    }
    cards.push(card);
  }

  for (const staged of payload.stagedSyncCards ?? []) {
    const key = canonicalKeyForEntry(staged);
    if (key && handled.has(key)) continue;
    if (key && placedByKey.has(key)) {
      cards.push(stagedToPlacedCard(staged, placedByKey.get(key)));
      handled.add(key);
      continue;
    }
    if (key && stagedByKey.has(key)) {
      stagedSyncCards.push({
        ...staged,
        stagingId: stagedByKey.get(key).stagingId ?? staged.stagingId,
      });
      handled.add(key);
      continue;
    }
    stagedSyncCards.push(staged);
  }

  return { cards, stagedSyncCards };
}

/**
 * Compare layout derived from JSON vs stored spec row (drift logging).
 * @param {object} payload
 * @param {object | null} specLayout
 */
/**
 * Apply spec_canvas_state layout/viewport onto a project JSON payload.
 * @param {object} payload
 * @param {{ layout?: object, viewport?: object }} specState
 */
export function applySpecCanvasLayoutToPayload(payload, specState) {
  if (!payload || !specState?.layout) return payload;
  const layout = specState.layout;
  const viewport = specState.viewport ?? layout.viewport;
  const { cards, stagedSyncCards } = applySpecSurfaces(payload, layout);
  return {
    ...payload,
    cards,
    stagedSyncCards,
    canvasView: viewport
      ? {
          x: viewport.x ?? payload.canvasView?.x ?? 0,
          y: viewport.y ?? payload.canvasView?.y ?? 0,
          zoom: viewport.zoom ?? payload.canvasView?.zoom ?? 1,
        }
      : payload.canvasView,
    artifactPlacements:
      layout.artifactPlacements ?? payload.artifactPlacements,
    specCanvasState: specState,
    specLayoutAuthoritative: true,
  };
}

export function specLayoutDrift(payload, specLayout) {
  const local = projectPayloadToSpecLayout(payload);
  const localKeys = new Set([
    ...local.placed.map((p) => p.syncKey),
    ...local.staging.map((s) => s.syncKey),
  ]);
  const remoteKeys = new Set([
    ...(specLayout?.placed ?? []).map((p) => p.syncKey),
    ...(specLayout?.staging ?? []).map((s) => s.syncKey),
  ]);
  if (localKeys.size !== remoteKeys.size) return true;
  for (const k of localKeys) {
    if (!remoteKeys.has(k)) return true;
  }
  return false;
}
