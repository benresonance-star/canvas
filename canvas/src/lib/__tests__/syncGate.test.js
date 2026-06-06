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

  it('allows different project scopes to run concurrently', async () => {
    let releaseP1;
    const p1Block = new Promise((resolve) => {
      releaseP1 = resolve;
    });
    let p1Ran = false;
    let p2Ran = false;

    const p1 = runSyncGate('push-if-newer', async () => {
      p1Ran = true;
      await p1Block;
      return 'p1';
    }, { scope: 'project:p1' });

    await Promise.resolve();
    const p2 = runSyncGate('push-if-newer', async () => {
      p2Ran = true;
      return 'p2';
    }, { scope: 'project:p2' });

    await Promise.resolve();
    expect(p1Ran).toBe(true);
    expect(p2Ran).toBe(true);
    await expect(p2).resolves.toBe('p2');
    releaseP1();
    await expect(p1).resolves.toBe('p1');
  });

  it('serializes work in the same project scope', async () => {
    let releaseFirst;
    const firstBlock = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    let secondRan = false;

    const first = runSyncGate('push-if-newer', async () => {
      await firstBlock;
      return 'first';
    }, { scope: 'project:p1' });

    await Promise.resolve();
    const second = runSyncGate('reconcile', async () => {
      secondRan = true;
      return 'second';
    }, { scope: 'project:p1' });

    await Promise.resolve();
    expect(secondRan).toBe(false);
    releaseFirst();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('global work waits for active project scopes', async () => {
    let releaseProject;
    const projectBlock = new Promise((resolve) => {
      releaseProject = resolve;
    });
    let globalRan = false;

    const project = runSyncGate('push-if-newer', async () => {
      await projectBlock;
      return 'project';
    }, { scope: 'project:p1' });

    await Promise.resolve();
    const global = runSyncGate('exclusive:boot', async () => {
      globalRan = true;
      return 'global';
    });

    await Promise.resolve();
    expect(globalRan).toBe(false);
    releaseProject();
    await expect(project).resolves.toBe('project');
    await expect(global).resolves.toBe('global');
  });
});
