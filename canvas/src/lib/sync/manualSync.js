/** Max time for footer Sync (server pull + optional folder scan). */
export const MANUAL_SYNC_TIMEOUT_MS = 90_000;

/**
 * Strip spinner flags from sync status without dropping errors/success payloads.
 * @param {object | null | undefined} prev
 */
export function clearManualSyncSpinnerFlags(prev) {
  if (!prev) return null;
  const { manualSyncing, banner, scanning, ...rest } = prev;
  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * @param {number} ms
 * @param {string} message
 */
export function manualSyncTimeoutPromise(ms, message = 'Sync timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Build user-visible Sync success message from pull/push metadata.
 * @param {object} strings
 * @param {{
 *   pulled?: boolean,
 *   revision?: number | null,
 *   missingServerDocument?: boolean,
 *   previewsRestored?: boolean,
 *   noChanges?: boolean,
 *   withFolderScan?: boolean,
 *   serverSyncEnabled?: boolean,
 * }} meta
 */
export function buildManualSyncSuccessMessage(strings, meta) {
  const {
    pulled,
    revision,
    missingServerDocument,
    previewsRestored,
    noChanges,
    withFolderScan,
    serverSyncEnabled,
  } = meta;

  if (missingServerDocument && serverSyncEnabled) {
    return strings.sync.serverDocumentMissing;
  }
  if (pulled) {
    return revision != null && revision > 0
      ? strings.sync.syncedFromServerRevision(revision)
      : strings.projects.syncedFromServer;
  }
  if (previewsRestored) return strings.sync.previewsRestored;
  if (noChanges && serverSyncEnabled) {
    return revision != null && revision > 0
      ? strings.sync.alreadySyncedRevision(revision)
      : strings.projects.alreadySyncedFromServer;
  }
  if (noChanges && withFolderScan) return strings.sync.nothingNew;
  return strings.sync.syncComplete;
}
