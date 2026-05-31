/**
 * Folder link state for a project on this browser.
 * Server holds connectedFolderName; IndexedDB holds the directory handle.
 */

/** @typedef {'linked' | 'linking' | 'needsReconnect' | 'needsConnect' | 'unlinked'} FolderLinkPhase */

/**
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   folderStoredOnDevice?: boolean,
 *   connectedFolderName?: string | null,
 *   folderLinkInProgress?: boolean,
 *   folderLinkProbeComplete?: boolean,
 * }} input
 * @returns {{
 *   phase: FolderLinkPhase,
 *   folderLinked: boolean,
 *   folderNeedsReconnect: boolean,
 *   folderNeedsConnect: boolean,
 * }}
 */
export function deriveFolderLinkState({
  folderHandle = null,
  folderStoredOnDevice = false,
  connectedFolderName = null,
  folderLinkInProgress = false,
  folderLinkProbeComplete = true,
} = {}) {
  const folderLinked = Boolean(folderHandle);
  const hasServerName = Boolean(connectedFolderName?.trim());

  if (folderLinked) {
    return {
      phase: 'linked',
      folderLinked: true,
      folderNeedsReconnect: false,
      folderNeedsConnect: false,
    };
  }

  if (folderLinkInProgress) {
    return {
      phase: 'linking',
      folderLinked: false,
      folderNeedsReconnect: false,
      folderNeedsConnect: false,
    };
  }

  if (folderStoredOnDevice) {
    if (!folderLinkProbeComplete || folderLinkInProgress) {
      return {
        phase: 'linking',
        folderLinked: false,
        folderNeedsReconnect: false,
        folderNeedsConnect: false,
      };
    }
    return {
      phase: 'needsReconnect',
      folderLinked: false,
      folderNeedsReconnect: true,
      folderNeedsConnect: false,
    };
  }

  if (hasServerName) {
    return {
      phase: 'needsConnect',
      folderLinked: false,
      folderNeedsReconnect: false,
      folderNeedsConnect: true,
    };
  }

  return {
    phase: 'unlinked',
    folderLinked: false,
    folderNeedsReconnect: false,
    folderNeedsConnect: false,
  };
}

/**
 * Resolve footer sync button action for handleSyncClick routing tests.
 * @param {{ folderLinked: boolean, folderNeedsReconnect: boolean, folderLinkInProgress?: boolean }} linkState
 * @returns {'scan' | 'reconnect' | 'connect'}
 */
export function resolveFolderSyncAction({
  folderLinked,
  folderNeedsReconnect,
  folderLinkInProgress = false,
}) {
  if (folderLinked) return 'scan';
  if (folderLinkInProgress) return 'reconnect';
  if (folderNeedsReconnect) return 'reconnect';
  return 'connect';
}
