import { beforeEach, describe, it, expect, vi } from 'vitest';

const mockIsApiAvailable = vi.fn();
const mockEnsureClusterForProject = vi.fn();
const mockIngestArtifacts = vi.fn();
const mockIngestLinksFromVersions = vi.fn();
const mockBuildCardKeyToArtifactRef = vi.fn();

vi.mock('../../primitivesApi.js', () => ({
  isApiAvailable: (...args) => mockIsApiAvailable(...args),
  ensureClusterForProject: (...args) => mockEnsureClusterForProject(...args),
  ingestArtifacts: (...args) => mockIngestArtifacts(...args),
}));

vi.mock('../linkIngest.js', () => ({
  ingestLinksFromVersions: (...args) => mockIngestLinksFromVersions(...args),
  buildCardKeyToArtifactRef: (...args) => mockBuildCardKeyToArtifactRef(...args),
}));

import { ingestFoundFiles, mergeArtifactRefsIntoCards } from '../syncIngest.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsApiAvailable.mockResolvedValue(true);
  mockEnsureClusterForProject.mockResolvedValue({ id: 'cluster-1' });
  mockIngestArtifacts.mockResolvedValue({
    clusterId: 'cluster-1',
    artifacts: [
      {
        content_hash: 'hash-json',
        artifactRef: { id: 'art-json', type: 'artifact' },
      },
      {
        content_hash: 'hash-py',
        artifactRef: { id: 'art-py', type: 'artifact' },
      },
    ],
  });
  mockBuildCardKeyToArtifactRef.mockReturnValue(new Map());
  mockIngestLinksFromVersions.mockResolvedValue({ created: 0 });
});

describe('mergeArtifactRefsIntoCards', () => {
  it('returns empty array when cards is null', () => {
    expect(mergeArtifactRefsIntoCards(null, { k: { versions: [] } })).toEqual([]);
  });

  it('handles card with null versions', () => {
    const cards = [{ key: 'a', versions: null }];
    const grouped = {
      a: {
        versions: [{ version: 1, artifactRef: { id: 'art-1' } }],
      },
    };
    const result = mergeArtifactRefsIntoCards(cards, grouped);
    expect(result[0].versions).toEqual([]);
  });

  it('merges artifact refs when grouped key is canonical and card key is legacy', () => {
    const cards = [{
      key: 'general__playbook-v1',
      versions: [{ version: 1, artifactRef: null }],
    }];
    const grouped = {
      'general__playbook': {
        versions: [{ version: 1, artifactRef: { id: 'art-2' }, content_hash: 'h2' }],
      },
    };
    const result = mergeArtifactRefsIntoCards(cards, grouped);
    expect(result[0].versions[0].artifactRef).toEqual({ id: 'art-2' });
    expect(result[0].versions[0].content_hash).toBe('h2');
  });

  it('merges artifact refs after rename reconciliation updates the card key', () => {
    const cards = [{
      key: 'docs__renamed',
      versions: [{ version: 1, filename: 'docs__renamed-v1.md', artifactRef: null }],
    }];
    const grouped = {
      'docs__renamed': {
        versions: [{
          version: 1,
          filename: 'docs__renamed-v1.md',
          artifactRef: { id: 'art-renamed', type: 'artifact' },
          content_hash: 'hash-renamed',
        }],
      },
    };

    const result = mergeArtifactRefsIntoCards(cards, grouped);

    expect(result[0].versions[0].artifactRef).toEqual({
      id: 'art-renamed',
      type: 'artifact',
    });
    expect(result[0].versions[0].content_hash).toBe('hash-renamed');
  });
});

describe('ingestFoundFiles', () => {
  it('captures JSON and Python code metadata in artifact ingest payloads', async () => {
    await ingestFoundFiles('project-1', 'Project', [
      {
        filename: 'data__settings-v1.json',
        relativePath: 'data/data__settings-v1.json',
        cardKey: 'data/data__settings',
        cardType: 'code',
        content: '{"enabled":true}\n',
        content_hash: 'hash-json',
        version: 1,
        lastModified: 123,
        prefix: 'data',
        name: 'settings',
      },
      {
        filename: 'scripts__runner-v1.py',
        relativePath: 'scripts/scripts__runner-v1.py',
        cardKey: 'scripts/scripts__runner',
        cardType: 'code',
        content: 'def run():\n    return True\n',
        content_hash: 'hash-py',
        version: 1,
        lastModified: 123,
        prefix: 'scripts',
        name: 'runner',
      },
    ]);

    expect(mockIngestArtifacts).toHaveBeenCalledWith('project-1', {
      files: [
        expect.objectContaining({
          type: 'doc',
          payload_text: '{"enabled":true}\n',
          metadata: expect.objectContaining({
            canvas_kind: 'code',
            file_kind: 'code',
            language: 'json',
            ext: 'json',
            filename: 'data__settings-v1.json',
          }),
        }),
        expect.objectContaining({
          type: 'doc',
          payload_text: 'def run():\n    return True\n',
          metadata: expect.objectContaining({
            canvas_kind: 'code',
            file_kind: 'code',
            language: 'python',
            ext: 'py',
            filename: 'scripts__runner-v1.py',
          }),
        }),
      ],
      relationships: [],
    });
  });
});
