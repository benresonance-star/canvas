/**
 * Unified project structure load API (Phase 4).
 * All UI and feature code should prefer this over direct sync calls.
 */
import {
  initializeProjectSync,
  loadSyncedProjectDocument,
} from '../projectSync.js';
import { reconcileSpecCanvasOnLoad } from '../specDataPlaneSync.js';
import {
  auditProjectArtifactViews,
  listProjectArtifactViews,
  reportProjectArtifactViewDiagnostics,
} from '../artifactViewsApi.js';
import {
  composeUserNoteArtifactViews,
  resolveArtifactViewMode,
  shouldReadUserNoteArtifactViews,
  summarizeUserNoteArtifactViewComparison,
} from '../userNoteArtifactViewProjection.js';

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
    const reconciled = await reconcileSpecCanvasOnLoad(projectId, doc);
    const mode = resolveArtifactViewMode();
    if (mode === 'shadow' && localOnly) {
      void auditProjectArtifactViews(projectId)
        .then((counts) => reportProjectArtifactViewDiagnostics(projectId, {
          mode,
          eventType: 'comparison',
          counts,
          metadata: { source: 'server_authoritative_audit' },
        }))
        .catch(() => {});
      return reconciled;
    }
    if (!shouldReadUserNoteArtifactViews(mode, { localOnly })) return reconciled;
    try {
      const views = await listProjectArtifactViews(projectId);
      const composed = composeUserNoteArtifactViews(reconciled, views, { mode });
      void reportProjectArtifactViewDiagnostics(projectId, {
        mode,
        eventType: 'comparison',
        counts: summarizeUserNoteArtifactViewComparison(reconciled, composed.mismatches),
      }).catch(() => {});
      if (composed.mismatches.length > 0) {
        console.warn('[artifact-view] user_note projection drift', {
          projectId,
          mode,
          mismatches: composed.mismatches,
        });
      }
      return composed.payload;
    } catch (error) {
      void reportProjectArtifactViewDiagnostics(projectId, {
        mode,
        eventType: 'read_fallback',
        counts: { read_fallback: 1 },
        metadata: { errorName: error?.name ?? 'Error' },
      }).catch(() => {});
      console.warn('[artifact-view] canonical read fallback', {
        projectId,
        mode,
        error: error.message,
      });
      if (mode === 'canonical') throw error;
      return reconciled;
    }
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
