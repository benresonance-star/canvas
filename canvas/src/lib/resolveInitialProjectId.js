import { resolveActiveProjectId } from './projects.js';

/**
 * Boot policy modes for cold start (pure; async recovery uses findBest separately).
 * @typedef {'honorIndex' | 'recoverLocalBody' | 'none'} InitialProjectMode
 */

/**
 * @param {object | null | undefined} index
 * @returns {InitialProjectMode}
 */
export function resolveInitialProjectMode(index) {
  if (!index?.projects?.length) return 'none';
  const activeId = resolveActiveProjectId(index);
  if (activeId) return 'honorIndex';
  return 'none';
}

/**
 * Index active id for honorIndex boot (no local-body override here).
 * @param {object | null | undefined} index
 * @returns {string | null}
 */
export function resolveInitialProjectId(index) {
  const mode = resolveInitialProjectMode(index);
  if (mode === 'none') return null;
  return resolveActiveProjectId(index);
}

/**
 * When honorIndex load fails and committed is still null, allow richer local id.
 * @param {string | null} honorId
 * @param {string | null} richerLocalId
 * @param {boolean} committedWasNull
 * @returns {string | null}
 */
export function resolveRecoverLocalBodyId(honorId, richerLocalId, committedWasNull) {
  if (!committedWasNull) return honorId;
  if (!richerLocalId) return honorId;
  if (!honorId) return richerLocalId;
  return richerLocalId;
}
