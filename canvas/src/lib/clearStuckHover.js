/**
 * Force the browser to recalculate :hover and clear selection after drag ends.
 * Applying pointer-events: none mid-hover can trap :hover until the next hit-test.
 */
export function clearStuckPointerHover(clientX, clientY) {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const prev = body.style.pointerEvents;
  body.style.pointerEvents = 'none';

  const stack =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

  document.elementFromPoint(clientX, clientY);
  body.style.pointerEvents = prev;

  window.getSelection?.()?.removeAllRanges();

  const seen = new Set();
  for (const el of stack) {
    let node = el;
    while (node && node !== document.body) {
      if (node.classList?.contains('group') && !seen.has(node)) {
        seen.add(node);
        node.dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, cancelable: true }),
        );
      }
      node = node.parentElement;
    }
  }
}
