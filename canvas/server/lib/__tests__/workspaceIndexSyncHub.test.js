import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribeWorkspaceIndexSync,
  unsubscribeWorkspaceIndexSync,
  publishWorkspaceIndexSync,
  resetWorkspaceIndexSyncHubForTests,
  getWorkspaceIndexSubscriberCount,
} from '../workspaceIndexSyncHub.js';

describe('workspaceIndexSyncHub', () => {
  beforeEach(() => {
    resetWorkspaceIndexSyncHubForTests();
  });

  it('publishes index_updated to subscribers', () => {
    const writes = [];
    const res = { write: (chunk) => writes.push(chunk) };
    subscribeWorkspaceIndexSync(res);
    publishWorkspaceIndexSync('index_updated', { revision: 2, clientId: 'remote' });
    expect(getWorkspaceIndexSubscriberCount()).toBe(1);
    expect(writes.join('')).toContain('index_updated');
    expect(writes.join('')).toContain('"revision":2');
    unsubscribeWorkspaceIndexSync(res);
    expect(getWorkspaceIndexSubscriberCount()).toBe(0);
  });
});
