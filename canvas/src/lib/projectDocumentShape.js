import { projectCardCount } from './sync/projectSyncMerge.js';

/**
 * Count user-visible artifact state across canvas and holding tray.
 * @param {object | null | undefined} doc
 */
export function projectArtifactCount(doc) {
  const canvasCards = projectCardCount(doc);
  const dockCards = Array.isArray(doc?.stagedSyncCards)
    ? doc.stagedSyncCards.length
    : 0;
  return canvasCards + dockCards;
}

/**
 * @param {object | null | undefined} doc
 */
export function summarizeProjectDocumentShape(doc) {
  const placements = doc?.artifactPlacements ?? {};
  let placementDock = 0;
  let placementCanvas = 0;
  for (const entry of Object.values(placements)) {
    if (entry?.surface === 'dock') placementDock += 1;
    else if (entry?.surface === 'canvas') placementCanvas += 1;
  }
  const canvasCards = projectCardCount(doc);
  const dockCards = projectArtifactCount(doc) - canvasCards;
  return {
    canvasCards,
    dockCards,
    placementDock,
    placementCanvas,
    isDockOnly: canvasCards === 0 && dockCards > 0,
  };
}

/**
 * @param {object | null | undefined} doc
 * @param {Set<string>} [suppressedKeys]
 */
export function countRestorableDockCards(doc, suppressedKeys) {
  const staged = doc?.stagedSyncCards ?? [];
  if (!suppressedKeys?.size) return staged.length;
  return staged.filter((s) => {
    const key = s?.key;
    return !key || !suppressedKeys.has(key);
  }).length;
}

/**
 * @param {object | null | undefined} doc
 * @param {Set<string>} [suppressedKeys]
 */
export function shouldOfferDockRestore(doc, suppressedKeys) {
  if (!doc) return false;
  const canvasCards = projectCardCount(doc);
  if (canvasCards > 0) return false;
  return countRestorableDockCards(doc, suppressedKeys) > 0;
}
