import { describe, it, expect, beforeEach } from 'vitest';
import {
  runExclusive,
  isSyncIdle,
  resetSyncCoordinatorForTests,
  markBootSyncCompleted,
  isBootSyncCompleted,
} from '../projectSyncCoordinator.js';

describe('projectSyncCoordinator', () => {
  beforeEach(() => {
    resetSyncCoordinatorForTests();
  });

  it('runExclusive runs fn when idle', async () => {
    const result = await runExclusive('test', async () => 42);
    expect(result).toBe(42);
    expect(isSyncIdle()).toBe(true);
  });

  it('runExclusive with skip returns null when busy', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const first = runExclusive('boot', async () => {
      await gate;
      return 'done';
    });
    const skipped = await runExclusive('poll', async () => 'poll', { mode: 'skip' });
    expect(skipped).toBeNull();
    release();
    await first;
    expect(isSyncIdle()).toBe(true);
  });

  it('markBootSyncCompleted sets flag', () => {
    expect(isBootSyncCompleted()).toBe(false);
    markBootSyncCompleted();
    expect(isBootSyncCompleted()).toBe(true);
  });
});
