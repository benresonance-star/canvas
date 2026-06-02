import { describe, it, expect, afterEach } from 'vitest';
import {
  runSyncGate,
  resetSyncGateForTests,
  canBypassSyncGateForPlacement,
} from '../syncGate.js';

describe('syncGate', () => {
  afterEach(() => {
    resetSyncGateForTests();
  });

  it('placementTransfer runs while exclusive:boot is in flight', async () => {
    let releaseBoot;
    const bootBlock = new Promise((resolve) => {
      releaseBoot = resolve;
    });

    const boot = runSyncGate('exclusive:boot', async () => {
      await bootBlock;
      return 'boot';
    });

    await Promise.resolve();
    expect(canBypassSyncGateForPlacement('action:placementTransfer')).toBe(true);

    const placement = await runSyncGate('action:placementTransfer', async () => 'placed');
    expect(placement).toBe('placed');

    releaseBoot();
    await expect(boot).resolves.toBe('boot');
  });

  it('layoutCommit waits for exclusive:boot', async () => {
    let releaseBoot;
    const bootBlock = new Promise((resolve) => {
      releaseBoot = resolve;
    });

    const boot = runSyncGate('exclusive:boot', async () => {
      await bootBlock;
      return 'boot';
    });

    await Promise.resolve();
    expect(canBypassSyncGateForPlacement('action:layoutCommit')).toBe(false);

    let layoutRan = false;
    const layout = runSyncGate('action:layoutCommit', async () => {
      layoutRan = true;
      return 'layout';
    });

    await Promise.resolve();
    expect(layoutRan).toBe(false);

    releaseBoot();
    await expect(layout).resolves.toBe('layout');
    await boot;
  });

  it('placementTransfer runs while action:structuralChange is in flight', async () => {
    let releaseStructural;
    const structuralBlock = new Promise((resolve) => {
      releaseStructural = resolve;
    });

    const structural = runSyncGate('action:structuralChange', async () => {
      await structuralBlock;
      return 'structural';
    });

    await Promise.resolve();
    expect(canBypassSyncGateForPlacement('action:placementTransfer')).toBe(true);

    const placement = await runSyncGate('action:placementTransfer', async () => 'placed');
    expect(placement).toBe('placed');

    releaseStructural();
    await expect(structural).resolves.toBe('structural');
  });
});
