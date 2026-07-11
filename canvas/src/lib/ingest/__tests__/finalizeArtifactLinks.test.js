import { describe, expect, it, vi, beforeEach } from 'vitest';

const ensureCardArtifactRef = vi.fn();
const flushArtifactSyncOutbox = vi.fn();
const processArtifactSyncRetryEntry = vi.fn();
const ensureClusterForProject = vi.fn();
const createLinksFromSource = vi.fn();

vi.mock('../../ensureCardArtifactRef.js', () => ({
  ensureCardArtifactRef: (...args) => ensureCardArtifactRef(...args),
}));
vi.mock('../../artifactSyncOutbox.js', () => ({
  flushArtifactSyncOutbox: (...args) => flushArtifactSyncOutbox(...args),
}));
vi.mock('../../artifactSyncRetry.js', () => ({
  processArtifactSyncRetryEntry: (...args) => processArtifactSyncRetryEntry(...args),
}));
vi.mock('../../primitivesApi.js', () => ({
  ensureClusterForProject: (...args) => ensureClusterForProject(...args),
}));
vi.mock('../linkIngest.js', () => ({
  createLinksFromSource: (...args) => createLinksFromSource(...args),
}));

import { finalizeArtifactLinks } from '../finalizeArtifactLinks.js';

describe('finalizeArtifactLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flushArtifactSyncOutbox.mockResolvedValue({ flushed: 0, remaining: 0 });
    ensureClusterForProject.mockResolvedValue({ cluster: { id: 'cluster-1' } });
    createLinksFromSource.mockResolvedValue(1);
  });

  it('creates links after ensuring artifact ref and cluster', async () => {
    const targetRef = { id: 'bim-1', type: 'artifact' };
    const sourceRef = { id: 'task-1', type: 'artifact' };
    ensureCardArtifactRef.mockResolvedValue({
      ok: true,
      artifactRef: sourceRef,
      version: { version: 1, artifactRef: sourceRef },
    });

    const result = await finalizeArtifactLinks({
      projectId: 'p1',
      projectName: 'Project',
      folderHandle: {},
      card: { id: 'card-1', key: 'tasks__todo', versions: [{ version: 1 }] },
      linkTargetRefs: [targetRef],
      clusterId: null,
      artifactRef: null,
    });

    expect(result).toMatchObject({
      ok: true,
      linked: 1,
      clusterId: 'cluster-1',
      artifactRef: sourceRef,
    });
    expect(createLinksFromSource).toHaveBeenCalledWith(
      'cluster-1',
      sourceRef,
      [targetRef],
    );
  });
});
