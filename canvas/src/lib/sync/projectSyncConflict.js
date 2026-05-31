import { canonicalKeyForEntry } from '../artifactPlacement.js';
import { payloadsEquivalent } from './projectSyncMerge.js';

/** @type {Map<string, { local: object, server: object, revision: number, at: number }>} */
const conflictByProject = new Map();

/**
 * @param {object | null | undefined} local
 * @param {object | null | undefined} server
 * @returns {boolean}
 */
export function projectPayloadsStructurallyEqual(local, server) {
  if (payloadsEquivalent(local, server)) return true;
  return false;
}

/**
 * @param {object | null | undefined} payload
 * @returns {{ canvasKeys: string[], dockKeys: string[], cardIds: string[] }}
 */
export function summarizeProjectPayload(payload) {
  const canvasKeys = [];
  const dockKeys = [];
  const cardIds = [];
  for (const c of payload?.cards ?? []) {
    const k = canonicalKeyForEntry(c);
    if (k) canvasKeys.push(k);
    if (c?.id) cardIds.push(c.id);
  }
  for (const s of payload?.stagedSyncCards ?? []) {
    const k = canonicalKeyForEntry(s);
    if (k) dockKeys.push(k);
  }
  canvasKeys.sort();
  dockKeys.sort();
  cardIds.sort();
  return { canvasKeys, dockKeys, cardIds };
}

/**
 * @param {object | null | undefined} local
 * @param {object | null | undefined} server
 * @returns {boolean} true when a human merge decision is needed
 */
export function needsProjectConflictResolution(local, server) {
  if (!local || !server) return false;
  const localCards = (local.cards ?? []).length + (local.stagedSyncCards ?? []).length;
  const serverCards = (server.cards ?? []).length + (server.stagedSyncCards ?? []).length;
  if (localCards > 0 && serverCards === 0) return false;
  if (serverCards > 0 && localCards === 0) return false;
  if (projectPayloadsStructurallyEqual(local, server)) return false;
  const a = summarizeProjectPayload(local);
  const b = summarizeProjectPayload(server);
  if (a.canvasKeys.join() !== b.canvasKeys.join()) return true;
  if (a.dockKeys.join() !== b.dockKeys.join()) return true;
  if (a.cardIds.join() !== b.cardIds.join()) return true;
  if (JSON.stringify(local?.canvasView) !== JSON.stringify(server?.canvasView)) {
    return true;
  }
  return false;
}

/**
 * @param {string} projectId
 * @param {object} local
 * @param {object} server
 * @param {number} serverRevision
 */
export function recordProjectConflict(projectId, local, server, serverRevision) {
  if (!projectId || !local || !server) return;
  conflictByProject.set(projectId, {
    local,
    server,
    revision: serverRevision,
    at: Date.now(),
  });
}

export function getProjectConflict(projectId) {
  return conflictByProject.get(projectId) ?? null;
}

export function clearProjectConflict(projectId) {
  conflictByProject.delete(projectId);
}

/** @internal */
export function resetProjectConflictsForTests() {
  conflictByProject.clear();
}
