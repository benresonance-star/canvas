/**
 * @param {object | null | undefined} doc
 */
export function summarizeArtifactDatabaseCounts(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const cards = Array.isArray(doc?.cards) ? doc.cards : [];
  const staged = Array.isArray(doc?.stagedSyncCards) ? doc.stagedSyncCards : [];
  const placements = Object.values(doc?.artifactPlacements ?? {});
  const placementCanvas = placements.filter((p) => p?.surface === 'canvas').length;
  const placementDock = placements.filter((p) => p?.surface === 'dock').length;
  return {
    dbCanvas: cards.length,
    dbDock: staged.length,
    dbTotal: cards.length + staged.length,
    placementCanvas,
    placementDock,
    placementTotal: placements.length,
  };
}

/**
 * @param {number} uiCanvas
 * @param {ReturnType<typeof summarizeArtifactDatabaseCounts> | null | undefined} db
 */
export function artifactCountAuditStatus(uiCanvas, db) {
  if (!db) return 'unknown';
  return uiCanvas === db.dbCanvas && db.dbCanvas === db.placementCanvas
    ? 'match'
    : 'mismatch';
}
