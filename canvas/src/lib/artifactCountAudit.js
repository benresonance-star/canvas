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
 * @param {number | { canvas?: number, dock?: number }} ui
 * @param {ReturnType<typeof summarizeArtifactDatabaseCounts> | null | undefined} db
 */
export function artifactCountAuditStatus(ui, db) {
  if (!db) return 'unknown';
  const uiCanvas = typeof ui === 'number' ? ui : Number(ui?.canvas ?? 0);
  const uiDock = typeof ui === 'number' ? 0 : Number(ui?.dock ?? 0);
  const uiTotal = uiCanvas + uiDock;
  return uiCanvas === db.dbCanvas
    && uiCanvas === db.placementCanvas
    && uiDock === db.dbDock
    && uiDock === db.placementDock
    && uiTotal === db.dbTotal
    && uiTotal === db.placementTotal
    ? 'match'
    : 'mismatch';
}
