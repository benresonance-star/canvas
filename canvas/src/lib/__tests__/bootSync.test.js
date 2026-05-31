import { describe, it, expect, vi } from 'vitest';
import {
  BOOT_LOADING_TIMEOUT_MS,
  withBootTimeout,
  shouldClearBootLoadingOnCancel,
  isSyncingFromServerBanner,
  clearSyncingFromServerBanner,
} from '../bootSync.js';
import { strings } from '../../content/strings.js';

describe('bootSync', () => {
  it('withBootTimeout rejects with BOOT_TIMEOUT code', async () => {
    await expect(
      withBootTimeout(new Promise(() => {}), 20),
    ).rejects.toMatchObject({ code: 'BOOT_TIMEOUT' });
  });

  it('withBootTimeout resolves when promise completes first', async () => {
    await expect(withBootTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });

  it('shouldClearBootLoadingOnCancel when cancelled with server sync', () => {
    expect(
      shouldClearBootLoadingOnCancel({ cancelled: true, serverSyncEnabled: true }),
    ).toBe(true);
    expect(
      shouldClearBootLoadingOnCancel({ cancelled: false, serverSyncEnabled: true }),
    ).toBe(false);
  });

  it('exports a reasonable default timeout', () => {
    expect(BOOT_LOADING_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);
  });

  it('isSyncingFromServerBanner matches boot pull copy', () => {
    expect(isSyncingFromServerBanner(strings.projects.syncingFromServer)).toBe(true);
    expect(isSyncingFromServerBanner(strings.projects.bootSyncTimeout)).toBe(false);
  });

  it('clearSyncingFromServerBanner removes only the boot pull banner', () => {
    let status = { banner: strings.projects.syncingFromServer };
    const setSyncStatus = (updater) => {
      status = typeof updater === 'function' ? updater(status) : updater;
    };
    clearSyncingFromServerBanner(setSyncStatus);
    expect(status).toBeNull();

    status = { banner: strings.projects.databaseUnavailable };
    clearSyncingFromServerBanner(setSyncStatus);
    expect(status.banner).toBe(strings.projects.databaseUnavailable);
  });
});
