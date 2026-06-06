import {
  projectPayloadToSpecLayout,
  projectPayloadToSpecViewport,
  specLayoutDrift,
} from './specDataPlane.js';
import { fetchSpecCanvasState, saveSpecCanvasState } from './specDataPlaneApi.js';
import { isApiAvailable } from './primitivesApi.js';
import { enqueueSpecSyncRetry } from './specSyncOutbox.js';

/**
 * Dual-write project payload to spec_canvas_state (best-effort).
 * @param {string} projectId
 * @param {object} payload full save payload
 */
export async function syncSpecCanvasStateFromPayload(projectId, payload) {
  if (!projectId || !payload) return { ok: false, skipped: true };
  const available = await isApiAvailable();
  if (!available) return { ok: false, skipped: true };

  try {
    const layout = projectPayloadToSpecLayout(payload);
    const viewport = projectPayloadToSpecViewport(payload);
    const existing = await fetchSpecCanvasState(projectId);
    const expectedVersion = existing?.version ?? 0;
    const result = await saveSpecCanvasState(
      projectId,
      { layout, viewport },
      expectedVersion,
    );
    if (result?.conflict && existing) {
      const retry = await saveSpecCanvasState(
        projectId,
        { layout, viewport },
        result.version ?? expectedVersion,
      );
      return retry?.ok ? { ok: true, retried: true } : { ok: false, conflict: true };
    }
    if (result?.ok) return { ok: true };
    enqueueSpecSyncRetry(projectId, payload);
    return { ok: false };
  } catch (e) {
    console.warn('spec canvas dual-write failed:', e);
    enqueueSpecSyncRetry(projectId, payload);
    return { ok: false, error: e };
  }
}

/**
 * Load spec canvas row for diagnostics/projection only.
 * canvas_project_document remains the rendered-canvas authority until an
 * explicit spec cutover is implemented.
 * @param {string} projectId
 * @param {object} payload
 */
export async function reconcileSpecCanvasOnLoad(projectId, payload) {
  if (!projectId) return payload;
  const available = await isApiAvailable();
  if (!available) return payload;

  try {
    const remote = await fetchSpecCanvasState(projectId);
    if (!remote?.layout) return payload;

    const specVersion = Number(remote.version) || 0;
    if (specLayoutDrift(payload, remote.layout)) {
      console.info(
        `[spec] layout drift for project ${projectId} - project JSON remains authoritative (spec revision ${specVersion})`,
      );
    }
    return {
      ...payload,
      specCanvasState: remote,
    };
  } catch {
    return payload;
  }
}
