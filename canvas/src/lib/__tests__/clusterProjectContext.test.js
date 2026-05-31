import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../primitivesApi.js', () => ({
  getClusterIdForProject: vi.fn(),
  ensureClusterForProject: vi.fn(),
}));

import {
  resolveWorkspaceClusterId,
  isClusterContextValid,
  EMPTY_CLUSTER_HULL_SOURCE,
} from '../clusterProjectContext.js';
import {
  getClusterIdForProject,
  ensureClusterForProject,
} from '../primitivesApi.js';

describe('isClusterContextValid', () => {
  it('requires matching non-null ids', () => {
    expect(isClusterContextValid('a', 'a')).toBe(true);
    expect(isClusterContextValid('a', 'b')).toBe(false);
    expect(isClusterContextValid(null, 'a')).toBe(false);
    expect(isClusterContextValid('a', null)).toBe(false);
  });
});

describe('EMPTY_CLUSTER_HULL_SOURCE', () => {
  it('starts empty', () => {
    expect(EMPTY_CLUSTER_HULL_SOURCE.clusters).toEqual([]);
    expect(EMPTY_CLUSTER_HULL_SOURCE.membersByClusterId.size).toBe(0);
  });
});

describe('resolveWorkspaceClusterId', () => {
  beforeEach(() => {
    vi.mocked(getClusterIdForProject).mockReset();
    vi.mocked(ensureClusterForProject).mockReset();
  });

  it('returns null when projectId is missing', async () => {
    expect(await resolveWorkspaceClusterId(null)).toBe(null);
    expect(getClusterIdForProject).not.toHaveBeenCalled();
  });

  it('returns existing workspace cluster id', async () => {
    vi.mocked(getClusterIdForProject).mockResolvedValue('ws-existing');
    const id = await resolveWorkspaceClusterId('proj-1', 'My Project');
    expect(id).toBe('ws-existing');
    expect(ensureClusterForProject).not.toHaveBeenCalled();
  });

  it('creates workspace cluster when none exists', async () => {
    vi.mocked(getClusterIdForProject).mockResolvedValue(null);
    vi.mocked(ensureClusterForProject).mockResolvedValue({
      cluster: { id: 'ws-new', name: 'My Project' },
    });
    const id = await resolveWorkspaceClusterId('proj-1', 'My Project');
    expect(id).toBe('ws-new');
    expect(ensureClusterForProject).toHaveBeenCalledWith('proj-1', 'My Project');
  });
});
