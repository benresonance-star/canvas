import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
vi.mock('../../db.js', () => ({ pool: { connect: vi.fn(async () => client) } }));
vi.mock('../../../src/primitives/shared/ulid.js', () => ({ newUlid: vi.fn(() => 'event-1') }));

const {
  commitArtifactViewPlacements,
  commitArtifactViewTransfer,
} = await import('../artifactViewPlacementService.js');

function queryResult(sql) {
  if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
  if (sql.includes('SELECT payload, revision')) return {
    rows: [{ revision: 4, payload: { cards: [{
      id: 'card-1', type: 'user_note', x: 1, y: 2,
      versions: [{ artifactRef: { id: 'artifact-1' } }],
    }] } }],
  };
  if (sql.includes('SELECT revision FROM canvas_project_document')) return {
    rows: [{ revision: 4 }],
  };
  if (sql.includes('SELECT * FROM artifact_view')) return { rows: [{ id: 'view-1', version: 7 }] };
  if (sql.includes('SELECT id FROM artifact_view')) return { rows: [] };
  if (sql.includes('SELECT artifact_id, x, y, width, height, z_index')) return {
    rows: [{
      artifact_id: 'artifact-1', x: 10, y: 20, width: 300, height: 180, z_index: null,
    }],
  };
  if (sql.includes('INSERT INTO artifact_view')) return {
    rows: [{ artifact_id: 'artifact-1', surface: 'dock', version: 1, updated_at: 'now' }],
  };
  if (sql.includes('UPDATE artifact_view')) return {
    rows: [{ artifact_id: 'artifact-1', version: 8, updated_at: 'now' }],
  };
  if (sql.includes('UPDATE canvas_project_document')) return {
    rows: [{ revision: 5, updated_at: 'now' }],
  };
  return { rows: [] };
}

describe('artifact view placement service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockImplementation(async (sql) => queryResult(sql));
  });

  it('updates canonical geometry and its compatibility projection in one transaction', async () => {
    const result = await commitArtifactViewPlacements('project-1', { placements: [{
      artifactId: 'artifact-1', expectedVersion: 7,
      x: 10, y: 20, width: 300, height: 180,
    }] });

    expect(result).toMatchObject({ documentRevision: 5, views: [{ version: 8 }] });
    const documentUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE canvas_project_document'));
    expect(JSON.parse(documentUpdate[1][1]).cards[0]).toMatchObject({
      x: 10, y: 20, width: 300, height: 180,
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back a stale view version', async () => {
    await expect(commitArtifactViewPlacements('project-1', { placements: [{
      artifactId: 'artifact-1', expectedVersion: 6,
      x: 10, y: 20, width: 300, height: 180,
    }] })).rejects.toMatchObject({ status: 409, currentVersion: 7 });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('moves canonical authority to the target surface with the compatibility projection', async () => {
    const payload = {
      cards: [],
      stagedSyncCards: [{
        type: 'user_note',
        versions: [{ artifactRef: { id: 'artifact-1' } }],
      }],
    };
    const result = await commitArtifactViewTransfer('project-1', {
      transfer: {
        artifactId: 'artifact-1', expectedVersion: 7,
        fromSurface: 'canvas', toSurface: 'dock',
      },
      payload,
    });

    expect(result).toMatchObject({
      documentRevision: 5,
      view: { artifactId: 'artifact-1', surface: 'dock', version: 1 },
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    const documentUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE canvas_project_document'));
    expect(JSON.parse(documentUpdate[1][1])).toEqual(payload);
  });
});
