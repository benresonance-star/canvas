import { strings } from '../content/strings.js';

/** Max wait for local index + IDB paint before showing the canvas. */
export const BOOT_LOADING_TIMEOUT_MS = 30000;

/** Post-boot server work may run longer without blocking the loading overlay. */
export const POST_BOOT_SYNC_TIMEOUT_MS = 120000;

/** Per-request API timeout should stay below boot budget (see canvasProjectsApi). */
export const BOOT_API_REQUEST_TIMEOUT_MS = 8000;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
export function withBootTimeout(promise, ms = BOOT_LOADING_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('boot-timeout');
        err.code = 'BOOT_TIMEOUT';
        reject(err);
      }, ms);
    }),
  ]);
}

/**
 * Whether boot loading overlay should clear when an in-flight boot async is cancelled.
 * @param {{ cancelled: boolean, serverSyncEnabled: boolean }} options
 */
export function shouldClearBootLoadingOnCancel({ cancelled, serverSyncEnabled }) {
  return cancelled && serverSyncEnabled;
}

/** @param {string | null | undefined} banner */
export function isSyncingFromServerBanner(banner) {
  return banner === strings.projects.syncingFromServer;
}

/**
 * Clear the transient post-boot pull banner (safe when effect cleanup / re-run).
 * @param {import('react').Dispatch<import('react').SetStateAction<object | null>>} setSyncStatus
 */
export function clearSyncingFromServerBanner(setSyncStatus) {
  setSyncStatus((prev) =>
    isSyncingFromServerBanner(prev?.banner) ? null : prev,
  );
}
