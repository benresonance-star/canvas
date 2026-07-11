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

  it('registers bim viewer sessions without a connected folder', async () => {
    const artifactRef = { id: 'art-bim', type: 'artifact' };
    vi.doMock('../primitivesApi.js', () => ({
      isApiAvailable: vi.fn(async () => true),
    }));
    vi.doMock('../artifactSyncOutbox.js', () => ({
      flushArtifactSyncOutbox: vi.fn(async () => {}),
    }));
    vi.doMock('../artifactRefLookup.js', () => ({
      lookupArtifactRefForCard: vi.fn(async () => null),
    }));
    vi.doMock('../ingest/bimViewerArtifact.js', () => ({
      isBimViewerSessionCard: vi.fn(() => true),
      registerBimViewerSessionArtifact: vi.fn(async () => ({
        ok: true,
        artifactRef,
        content_hash: 'hash-1',
      })),
    }));
    const { ensureCardArtifactRef } = await import('../ensureCardArtifactRef.js');
    const result = await ensureCardArtifactRef({
      projectId: 'p1',
      folderHandle: null,
      card: {
        key: 'bim-viewers__abc',
        prefix: 'bim-viewers',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'IFC Viewer.ifc-viewer.json',
          bim: { viewerKind: 'ifc-viewer-session', session: { id: 'bim-session:abc' } },
        }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifactRef).toEqual(artifactRef);
    }
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
