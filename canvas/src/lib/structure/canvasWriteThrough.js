import { syncSpecCanvasStateFromPayload } from '../specDataPlaneSync.js';
import { isServerSyncEnabled } from '../projectSync.js';

/** Reasons that update layout/viewport/placements in Postgres (spec_canvas_state). */
const WRITE_THROUGH_REASON_PREFIXES = [
  'layoutCommit',
  'viewCommit',
  'placementTransfer',
  'structuralChange',
  'structural-retry',
  'folderScan',
  'persistPlacementLocally',
  'flush',
  'createProject',
  'commit:',
  'action:',
];

/**
 * Whether this commit reason should dual-write structure to spec_canvas_state immediately.
 * @param {string} reason
 */
export function shouldWriteThroughSpecCanvas(reason) {
  if (!reason) return false;
  return WRITE_THROUGH_REASON_PREFIXES.some(
    (prefix) => reason === prefix || reason.startsWith(prefix),
  );
}

/**
 * Persist canvas layout/viewport/placements to spec_canvas_state (Postgres).
 * @param {string} projectId
 * @param {object} payload
 * @param {string} [reason]
 */
export async function writeThroughSpecCanvasFromPayload(projectId, payload, reason = '') {
  if (!projectId || !payload) return { ok: false, skipped: true, reason: 'no_payload' };
  if (!isServerSyncEnabled()) return { ok: false, skipped: true, reason: 'no_sync' };
  if (!shouldWriteThroughSpecCanvas(reason)) {
    return { ok: true, skipped: true, reason: 'reason_excluded' };
  }
  return syncSpecCanvasStateFromPayload(projectId, payload);
}
