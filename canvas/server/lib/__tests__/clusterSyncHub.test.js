import { describe, it, expect, beforeEach } from 'vitest';
import {
  subscribeClusterSync,
  unsubscribeClusterSync,
  publishClusterSync,
  resetClusterSyncHubForTests,
  getClusterSubscriberCount,
} from '../clusterSyncHub.js';

describe('clusterSyncHub', () => {
  beforeEach(() => {
    resetClusterSyncHubForTests();
  });

  it('publishes cluster updates only to project subscribers', () => {
    const projectAWrites = [];
    const projectBWrites = [];
    const resA = { write: (chunk) => projectAWrites.push(chunk) };
    const resB = { write: (chunk) => projectBWrites.push(chunk) };

    subscribeClusterSync('project-a', resA);
    subscribeClusterSync('project-b', resB);
    publishClusterSync('project-a', 'clusters_updated', {
      clusterId: 'cluster-1',
      action: 'created',
    });

    expect(getClusterSubscriberCount('project-a')).toBe(1);
    expect(projectAWrites.join('')).toContain('clusters_updated');
    expect(projectAWrites.join('')).toContain('"clusterId":"cluster-1"');
    expect(projectBWrites).toHaveLength(0);

    unsubscribeClusterSync('project-a', resA);
    expect(getClusterSubscriberCount('project-a')).toBe(0);
  });
});
