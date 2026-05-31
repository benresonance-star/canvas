/**
 * Clear folder-scan spinner state unless a terminal status was already set.
 * @param {object | null | undefined} prev
 * @param {object | null | undefined} nextStatus
 */
export function resolveScanExitStatus(prev, nextStatus) {
  if (!prev?.scanning) return prev;
  return nextStatus ?? null;
}
