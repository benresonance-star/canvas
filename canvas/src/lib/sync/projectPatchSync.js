/**
 * Feature flag for PATCH + SSE realtime sync.
 * Default on unless explicitly disabled.
 */
export function isProjectPatchSyncEnabled() {
  const raw = import.meta.env.VITE_CANVAS_PATCH_SYNC;
  if (raw === '0' || raw === 'false') return false;
  return true;
}
