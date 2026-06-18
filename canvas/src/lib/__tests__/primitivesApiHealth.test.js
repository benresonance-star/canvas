import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchHealth,
  clusterApiStatusFromHealth,
  deleteProjectArtifactPrimitive,
  listWorkspaceEvents,
  listWorkspacePrimitives,
} from '../primitivesApi.js';
import { resolveApiBase } from '../apiBase.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clusterApiStatusFromHealth', () => {
  it('reports api_unreachable when API is not reachable', () => {
    expect(clusterApiStatusFromHealth({ apiReachable: false, ok: false, dbReady: false })).toEqual({
      available: false,
      reason: 'api_unreachable',
    });
  });

  it('reports db_unavailable when API is up but DB is not ready', () => {
    expect(clusterApiStatusFromHealth({ apiReachable: true, ok: false, dbReady: false })).toEqual({
      available: false,
      reason: 'db_unavailable',
    });
  });

  it('reports ok when API and DB are healthy', () => {
    expect(clusterApiStatusFromHealth({ apiReachable: true, ok: true, dbReady: true })).toEqual({
      available: true,
      reason: 'ok',
    });
  });
});

describe('fetchHealth', () => {
  it('reports ready for a valid health payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({ ok: true, dbReady: true }),
    });

    await expect(fetchHealth()).resolves.toEqual({
      apiReachable: true,
      ok: true,
      dbReady: true,
      error: null,
    });
  });

  it('keeps database unavailable for the health route 503 payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        dbReady: false,
        error: 'Database unavailable',
      }),
    });

    await expect(fetchHealth()).resolves.toEqual({
      apiReachable: true,
      ok: false,
      dbReady: false,
      error: 'Database unavailable',
    });
  });

  it('does not classify a non-health response as database unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({}),
    });

    await expect(fetchHealth()).resolves.toEqual({
      apiReachable: false,
      ok: false,
      dbReady: false,
      error: null,
    });
  });
});

describe('workspace primitive API wrappers', () => {
  it('requests all-project primitive scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await expect(listWorkspacePrimitives({ type: 'artifact', limit: 25 })).resolves.toEqual({
      items: [],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workspace/primitives?type=artifact&limit=25');
  });

  it('requests all-project event scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await expect(listWorkspaceEvents({ limit: 25 })).resolves.toEqual({ items: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workspace/events?limit=25');
  });

  it('requests project-scoped artifact primitive cleanup', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await expect(deleteProjectArtifactPrimitive('project 1', 'artifact/1')).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/project%201/artifacts/artifact%2F1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('resolveApiBase', () => {
  it('uses the Vite proxy for local dev', () => {
    expect(resolveApiBase({
      env: {},
      location: { hostname: 'localhost', port: '5173' },
    })).toBe('/api');
  });

  it('allows an explicit API override', () => {
    expect(resolveApiBase({
      env: { VITE_PRIMITIVES_API: 'http://localhost:3001' },
      location: { hostname: 'localhost', port: '5173' },
    })).toBe('http://localhost:3001');
  });
});
