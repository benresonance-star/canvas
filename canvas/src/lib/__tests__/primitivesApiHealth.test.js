import { describe, it, expect } from 'vitest';
import { clusterApiStatusFromHealth } from '../primitivesApi.js';

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
