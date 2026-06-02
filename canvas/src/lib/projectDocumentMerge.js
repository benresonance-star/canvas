import {
  mergeLocalPlacementStateIntoDoc,
  localPlacementShouldWin,
  patchPlacementsMapFromArrays,
} from './artifactPlacementsMap.js';
import { canonicalKeyForEntry } from './artifactPlacement.js';
import { mergeOptimisticCardsIntoDoc } from './optimisticCards.js';
import { placementMapDiffers } from './placementTransfer.js';
import { buildPayloadAfterDockRestore } from './restoreDockToCanvas.js';
import { summarizeProjectDocumentShape } from './projectDocumentShape.js';
import { projectCardCount } from './sync/projectSyncMerge.js';

/** Best-known non-zero card count per project (guards against emptying local via stale server). */
const lastGoodCardCountByProjectId = new Map();

export function recordGoodLocalCardCount(projectId, count) {
  if (projectId && count > 0) {
    lastGoodCardCountByProjectId.set(projectId, count);
  }
}

export function getLastGoodLocalCardCount(projectId) {
  return lastGoodCardCountByProjectId.get(projectId) ?? 0;
}

export function clearLastGoodLocalCardCount(projectId) {
  lastGoodCardCountByProjectId.delete(projectId);
}

/**
 * Avoid persisting empty canvas + populated dock when local history had canvas layout.
 * @param {object} mergedPayload
 * @param {{ localDoc?: object | null, placementSource?: object | null, projectId?: string }} ctx
 */
export function preserveCanvasCardsInMergedPayload(mergedPayload, ctx = {}) {
  if (!mergedPayload) return mergedPayload;
  const shape = summarizeProjectDocumentShape(mergedPayload);
  if (!shape.isDockOnly) return mergedPayload;

  const { localDoc, placementSource, projectId } = ctx;
  const localCanvas = projectCardCount(localDoc);
  const pendingCanvas = projectCardCount(placementSource);
  const lastGood = projectId ? getLastGoodLocalCardCount(projectId) : 0;

  if (localCanvas === 0 && pendingCanvas === 0 && lastGood === 0) {
    return mergedPayload;
  }

  const sourceWithCanvas =
    localCanvas > 0
      ? localDoc
      : pendingCanvas > 0
        ? placementSource
        : null;

  if (sourceWithCanvas?.cards?.length) {
    const cards = sourceWithCanvas.cards;
    const canvasKeys = new Set(
      cards.map((c) => canonicalKeyForEntry(c)).filter(Boolean),
    );
    const staged = (mergedPayload.stagedSyncCards ?? []).filter(
      (s) => !canvasKeys.has(canonicalKeyForEntry(s)),
    );
    const existingMap =
      sourceWithCanvas.artifactPlacements
      ?? mergedPayload.artifactPlacements
      ?? {};
    return {
      ...mergedPayload,
      cards,
      stagedSyncCards: staged,
      canvasView: sourceWithCanvas.canvasView ?? mergedPayload.canvasView,
      artifactPlacements: patchPlacementsMapFromArrays(existingMap, cards, staged),
    };
  }

  const { payload: restoredPayload, restored } = buildPayloadAfterDockRestore(
    mergedPayload,
    mergedPayload.stagedSyncCards ?? [],
  );
  if (restored > 0) {
    recordGoodLocalCardCount(projectId, restored);
  }
  return restoredPayload;
}

/**
 * Merge local and remote project documents for inbound sync (pull / reconcile / boot).
 * Arrays are authoritative; placement map is patched from arrays before compare.
 *
 * @param {object | null | undefined} localDoc
 * @param {object | null | undefined} remoteDoc
 * @param {{
 *   localEditAt?: number,
 *   serverAt?: number,
 *   projectId?: string,
 *   placementSource?: object | null,
 *   reason?: string,
 * }} [options]
 * @returns {{
 *   merged: object | null,
 *   decision: 'keptLocal' | 'adoptedRemote' | 'merged',
 *   skipWrite: boolean,
 * }}
 */
export function mergeProjectDocuments(localDoc, remoteDoc, options = {}) {
  const {
    localEditAt = 0,
    serverAt = 0,
    projectId,
    placementSource = localDoc,
    reason = 'merge',
  } = options;

  if (!remoteDoc) {
    return {
      merged: localDoc ?? null,
      decision: 'keptLocal',
      skipWrite: false,
    };
  }

  if (!localDoc) {
    return {
      merged: remoteDoc,
      decision: 'adoptedRemote',
      skipWrite: false,
    };
  }

  const localPatched = patchLocalDocFromArrays(localDoc);
  const remotePatched = patchLocalDocFromArrays(remoteDoc);
  const placementRef = placementSource
    ? patchLocalDocFromArrays(placementSource)
    : localPatched;

  const localLayoutNewer =
    localEditAt > serverAt
    || localPlacementShouldWin(
      placementRef,
      remotePatched,
      localEditAt,
      serverAt,
    );

  let merged;
  let decision;
  if (localLayoutNewer) {
    merged = placementRef ?? localPatched;
    decision = 'keptLocal';
  } else {
    merged = mergeOptimisticCardsIntoDoc(
      projectId ?? '',
      remotePatched,
      placementRef?.cards ?? localPatched.cards,
    );
    if (localLayoutNewer) {
      merged = mergeLocalPlacementStateIntoDoc(merged, placementRef);
    }
    decision = 'merged';
  }

  merged = preserveCanvasCardsInMergedPayload(merged, {
    localDoc: localPatched,
    placementSource: placementRef,
    projectId,
  });

  const localCanvasCount = projectCardCount(localPatched);
  const mergedCanvasCount = projectCardCount(merged);
  if (localCanvasCount > 0 && mergedCanvasCount < localCanvasCount) {
    return {
      merged: localPatched,
      decision: 'keptLocal',
      skipWrite: true,
      reason: `${reason}:regression`,
    };
  }

  return { merged, decision, skipWrite: false };
}

/**
 * @param {object} doc
 * @returns {object}
 */
export function patchLocalDocFromArrays(doc) {
  if (!doc) return doc;
  const cards = doc.cards ?? [];
  const staged = doc.stagedSyncCards ?? [];
  const artifactPlacements = patchPlacementsMapFromArrays(
    doc.artifactPlacements ?? {},
    cards,
    staged,
  );
  return { ...doc, cards, stagedSyncCards: staged, artifactPlacements };
}

/**
 * Whether inbound reconcile should be skipped after a folder scan commit.
 * @param {object | null | undefined} localDoc
 * @param {object | null | undefined} serverDoc
 * @returns {boolean}
 */
export function shouldSkipInboundReconcileAfterLocalCommit(localDoc, serverDoc) {
  if (!localDoc || !serverDoc) return false;
  const localPatched = patchLocalDocFromArrays(localDoc);
  const serverPatched = patchLocalDocFromArrays(serverDoc);
  const localCanvas = projectCardCount(localPatched);
  const serverCanvas = projectCardCount(serverPatched);
  if (localCanvas > serverCanvas) return true;
  if (
    placementMapDiffers(
      localPatched.artifactPlacements,
      serverPatched.artifactPlacements,
    )
  ) {
    return true;
  }
  return localPlacementShouldWin(
    localPatched,
    serverPatched,
    0,
    Number.MAX_SAFE_INTEGER,
  );
}
