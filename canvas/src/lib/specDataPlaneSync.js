import {
  applySpecCanvasLayoutToPayload,
  projectPayloadToSpecLayout,
  projectPayloadToSpecViewport,
  specLayoutDrift,
} from './specDataPlane.js';
import { fetchSpecCanvasState, saveSpecCanvasState } from './specDataPlaneApi.js';
import { fetchCanvasProjectMeta } from './canvasProjectsApi.js';
import { isApiAvailable } from './primitivesApi.js';
import { enqueueSpecSyncRetry } from './specSyncOutbox.js';

function parseUpdatedAt(value) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

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
 * Load spec canvas row; when its timestamp is at least as fresh as the project document,
 * spec layout wins for canvas placement/viewport.
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

    const meta = await fetchCanvasProjectMeta(projectId);
    const specVersion = Number(remote.version) || 0;
    const specUpdatedAt = parseUpdatedAt(remote.updatedAt);
    const docUpdatedAt = parseUpdatedAt(meta?.updatedAt);
    const specOnlySource = !meta && specUpdatedAt > 0;
    const specAtLeastDocument =
      meta && specUpdatedAt > 0 && (
        docUpdatedAt === 0 || specUpdatedAt >= docUpdatedAt
      );

    if (specOnlySource || specAtLeastDocument) {
      if (specLayoutDrift(payload, remote.layout)) {
        console.info(
          `[spec] layout drift for project ${projectId} — applying spec_canvas_state (revision ${specVersion})`,
        );
      }
      return applySpecCanvasLayoutToPayload(payload, remote);
    }

    if (specLayoutDrift(payload, remote.layout)) {
      console.info(
        `[spec] layout drift for project ${projectId} — project JSON remains authoritative`,
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
