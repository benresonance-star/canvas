/**
 * Unified project structure load API (Phase 4).
 * All UI and feature code should prefer this over direct sync calls.
 */
import {
  initializeProjectSync,
  loadSyncedProjectDocument,
} from '../projectSync.js';
import { reconcileSpecCanvasOnLoad } from '../specDataPlaneSync.js';

/**
 * Load project document with spec canvas reconciliation applied.
 * @param {string} projectId
 * @param {{ localOnly?: boolean }} [options]
 */
export async function loadProjectStructure(projectId, { localOnly = false } = {}) {
  if (!projectId) return null;
  try {
    await initializeProjectSync();
    const doc = await loadSyncedProjectDocument(projectId, { localOnly });
    if (!doc) return null;
    return reconcileSpecCanvasOnLoad(projectId, doc);
  } catch {
    return null;
  }
}

/** @deprecated Use loadProjectStructure */
export const loadProjectDocument = loadProjectStructure;

/**
 * Phase 4 load fence: reconcile spec canvas layout when spec version matches document revision.
 * Call on server-pull / patch-merged documents before UI hydrate (canonical load uses
 * {@link loadProjectStructure} which applies this automatically).
 *
 * @param {string} projectId
 * @param {object} payload
 */
export async function applyProjectLoadFence(projectId, payload) {
  if (!projectId || !payload) return payload;
  return reconcileSpecCanvasOnLoad(projectId, payload);
}
