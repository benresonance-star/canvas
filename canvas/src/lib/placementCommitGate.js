/**
 * Placement commit gating (I6) — testable helpers shared by useActionSync.
 */

/**
 * Only interactive dock/canvas placement transfers are gated during project switch.
 * Folder scan, structural saves, and action-sync must not use this gate.
 * @param {string} [reason]
 */
export function shouldGatePlacementCommit(reason) {
  return typeof reason === 'string' && reason.startsWith('placementTransfer');
}

/**
 * @param {{ current?: boolean } | null | undefined} canMutateCanvasRef
 * @returns {boolean}
 */
export function isPlacementCommitBlocked(canMutateCanvasRef) {
  return Boolean(canMutateCanvasRef && !canMutateCanvasRef.current);
}

/**
 * @param {{ current?: boolean } | null | undefined} canMutateCanvasRef
 * @returns {{ ok: false, skipped: 'projection_not_ready', deferred: true } | null}
 */
export function placementCommitBlockedResult(canMutateCanvasRef) {
  if (!isPlacementCommitBlocked(canMutateCanvasRef)) return null;
  return { ok: false, skipped: 'projection_not_ready', deferred: true };
}
