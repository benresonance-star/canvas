import { strings } from '../content/strings.js';

/** @param {string | null | undefined} banner */
export function isRevisionStaleBanner(banner) {
  return banner === strings.projects.serverRevisionStale;
}

/**
 * @param {'live' | 'stale' | 'offline'} syncLock
 * @param {string | null | undefined} banner
 */
export function isProjectConflictBanner(banner) {
  return banner === strings.projects.projectSyncConflict;
}

export function resolveSyncBanner(syncLock, banner) {
  if (syncLock === 'live' && isRevisionStaleBanner(banner)) {
    return null;
  }
  if (syncLock === 'stale' && (isRevisionStaleBanner(banner) || isProjectConflictBanner(banner))) {
    return banner;
  }
  return banner ?? null;
}

/**
 * @param {'live' | 'stale' | 'offline'} syncLock
 * @param {string | null | undefined} banner
 * @param {boolean} hasRefreshHandler
 */
export function shouldShowRefreshFromServer(syncLock, banner, hasRefreshHandler) {
  void syncLock;
  void banner;
  void hasRefreshHandler;
  return false;
}
