/**
 * Clear folder-scan spinner state unless a terminal status was already set.
 * @param {object | null | undefined} prev
 * @param {object | null | undefined} nextStatus
 */
export function resolveScanExitStatus(prev, nextStatus) {
  if (!prev?.scanning) return prev;
  if (nextStatus == null) return null;
  const { scanning: _removed, ...rest } = nextStatus;
  return rest;
}
