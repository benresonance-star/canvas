import { isValidFragmentsLocalId } from './fragmentsSelection.js';

export const PICK_DRAG_THRESHOLD_PX = 5;
export const GHOST_OTHERS_BATCH_SIZE = 2000;

export function isFragmentsRaycastHit(hit) {
  if (!hit || typeof hit !== 'object') return false;
  return [hit.localId, hit.itemId].some(isValidFragmentsLocalId);
}

export function resolveFragmentsPickLocalIds(hit) {
  return [...new Set([hit?.itemId, hit?.localId].filter(isValidFragmentsLocalId))];
}

export function shouldSuppressPickFromDrag(pointerDown, pointerUp, threshold = PICK_DRAG_THRESHOLD_PX) {
  if (!pointerDown || !pointerUp) return false;
  return Math.hypot(pointerUp.x - pointerDown.x, pointerUp.y - pointerDown.y) > threshold;
}

export function isPickSuperseded(pickSeq, activeSeq) {
  return pickSeq !== activeSeq;
}

export function shouldApplySelectionRun(runSeq, latestSeq) {
  return runSeq === latestSeq;
}

export function chunkLocalIds(localIds, batchSize = GHOST_OTHERS_BATCH_SIZE) {
  if (!Array.isArray(localIds) || localIds.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < localIds.length; index += batchSize) {
    chunks.push(localIds.slice(index, index + batchSize));
  }
  return chunks;
}
