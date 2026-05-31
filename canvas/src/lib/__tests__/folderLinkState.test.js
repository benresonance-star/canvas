import { describe, it, expect } from 'vitest';
import { deriveFolderLinkState, resolveFolderSyncAction } from '../folderLinkState.js';

describe('deriveFolderLinkState', () => {
  it('returns linked when folderHandle is set', () => {
    const state = deriveFolderLinkState({
      folderHandle: { name: 'docs' },
      folderStoredOnDevice: true,
      connectedFolderName: 'docs',
    });
    expect(state.phase).toBe('linked');
    expect(state.folderLinked).toBe(true);
    expect(state.folderNeedsReconnect).toBe(false);
    expect(state.folderNeedsConnect).toBe(false);
  });

  it('returns linking when restore is in progress', () => {
    const state = deriveFolderLinkState({
      folderHandle: null,
      folderStoredOnDevice: true,
      connectedFolderName: 'docs',
      folderLinkInProgress: true,
    });
    expect(state.phase).toBe('linking');
    expect(state.folderNeedsReconnect).toBe(false);
    expect(state.folderNeedsConnect).toBe(false);
  });

  it('returns linking while stored handle permission is still being probed', () => {
    const state = deriveFolderLinkState({
      folderHandle: null,
      folderStoredOnDevice: true,
      connectedFolderName: 'docs',
      folderLinkProbeComplete: false,
    });
    expect(state.phase).toBe('linking');
    expect(state.folderNeedsReconnect).toBe(false);
  });

  it('returns needsReconnect when stored but no active handle', () => {
    const state = deriveFolderLinkState({
      folderHandle: null,
      folderStoredOnDevice: true,
      connectedFolderName: 'docs',
      folderLinkProbeComplete: true,
    });
    expect(state.phase).toBe('needsReconnect');
    expect(state.folderNeedsReconnect).toBe(true);
    expect(state.folderNeedsConnect).toBe(false);
  });

  it('returns needsConnect when server has name but no local handle', () => {
    const state = deriveFolderLinkState({
      folderHandle: null,
      folderStoredOnDevice: false,
      connectedFolderName: 'test folder',
    });
    expect(state.phase).toBe('needsConnect');
    expect(state.folderNeedsConnect).toBe(true);
    expect(state.folderNeedsReconnect).toBe(false);
  });

  it('returns unlinked when nothing is bound', () => {
    const state = deriveFolderLinkState({
      folderHandle: null,
      folderStoredOnDevice: false,
      connectedFolderName: null,
    });
    expect(state.phase).toBe('unlinked');
    expect(state.folderNeedsConnect).toBe(false);
    expect(state.folderNeedsReconnect).toBe(false);
  });
});

describe('resolveFolderSyncAction', () => {
  it('prefers scan when linked', () => {
    expect(
      resolveFolderSyncAction({ folderLinked: true, folderNeedsReconnect: false }),
    ).toBe('scan');
  });

  it('reconnect when handle stored but not linked', () => {
    expect(
      resolveFolderSyncAction({ folderLinked: false, folderNeedsReconnect: true }),
    ).toBe('reconnect');
  });

  it('reconnect while folder link is in progress', () => {
    expect(
      resolveFolderSyncAction({
        folderLinked: false,
        folderNeedsReconnect: false,
        folderLinkInProgress: true,
      }),
    ).toBe('reconnect');
  });

  it('connect when unlinked', () => {
    expect(
      resolveFolderSyncAction({ folderLinked: false, folderNeedsReconnect: false }),
    ).toBe('connect');
  });
});
