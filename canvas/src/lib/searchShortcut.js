/** Modifier + key labels for the search command palette shortcut. */
export function getSearchShortcutKeys() {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return isMac ? { modifier: '⌘', key: 'K' } : { modifier: 'Ctrl', key: 'K' };
}
