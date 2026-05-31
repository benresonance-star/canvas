import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('ensureCardArtifactRef', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns existing artifactRef without ingest', async () => {
    const ref = { id: 'art-1', type: 'artifact' };
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(),
    }));
    vi.doMock('../ingest/syncIngest.js', () => ({
      ingestFoundFiles: vi.fn(),
    }));
    const { ensureCardArtifactRef } = await import('../ensureCardArtifactRef.js');
    const result = await ensureCardArtifactRef({
      projectId: 'p1',
      card: {
        key: 'notes__test',
        pinnedVersion: 1,
        versions: [{ version: 1, artifactRef: ref }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifactRef).toEqual(ref);
    }
  });

  it('returns not_synced when folder file missing', async () => {
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => true),
    }));
    const { ensureCardArtifactRef } = await import('../ensureCardArtifactRef.js');
    const result = await ensureCardArtifactRef({
      projectId: 'p1',
      folderHandle: null,
      card: {
        key: 'notes__test',
        pinnedVersion: 1,
        versions: [{ version: 1, filename: 'notes__test-v1.md' }],
      },
    });
    expect(result).toEqual({ ok: false, reason: 'not_synced' });
  });

  it('returns api_unavailable when API is down', async () => {
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => false),
    }));
    const { ensureCardArtifactRef } = await import('../ensureCardArtifactRef.js');
    const result = await ensureCardArtifactRef({
      projectId: 'p1',
      folderHandle: {},
      card: {
        key: 'notes__test',
        pinnedVersion: 1,
        versions: [{ version: 1, filename: 'notes__test-v1.md' }],
      },
    });
    expect(result).toEqual({ ok: false, reason: 'api_unavailable' });
  });
});
