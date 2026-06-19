/** Whether card drag should ignore this event target (resize / link handles). */
export function cardDragIgnoresTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest('[data-card-resize-handle]')
    || target.closest('[data-link-handle]')
    || target.closest('[data-card-interactive-edit]')
    || target.closest('[data-artifact-scroll]')
    || target.closest('[data-card-artifact-controls]'),
  );
}

/**
 * @param {object | null | undefined} pinned
 * @returns {object | null}
 */
export function artifactRefFromPinnedVersion(pinned) {
  const ref = pinned?.artifactRef;
  return ref?.id ? ref : null;
}
