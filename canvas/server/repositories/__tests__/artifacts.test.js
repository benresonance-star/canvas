import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const addClusterMember = vi.fn();
const appendEvent = vi.fn();

vi.mock('../../db.js', () => ({ query }));
vi.mock('../../events.js', () => ({ appendEvent }));
vi.mock('../clusters.js', () => ({ addClusterMember }));
vi.mock('../../../src/primitives/shared/ulid.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    newUlid: vi.fn(() => '01KVFSHET98Q4N5DE5QTA6R0X4'),
  };
});

const { upsertArtifactByHash } = await import('../artifacts.js');
const { newUlid } = await import('../../../src/primitives/shared/ulid.js');

const baseFields = {
  type: 'user_note',
  uri: 'folder-relative:project-1/notes__hello-v1.md',
  content_hash: 'hash-new-note',
  version: '1',
  payload_text: '# Hello',
  metadata: { filename: 'notes__hello-v1.md', cardKey: 'notes__hello' },
};

beforeEach(() => {
  query.mockReset();
  addClusterMember.mockReset();
  appendEvent.mockReset();
  newUlid.mockReturnValue('01KVFSHET98Q4N5DE5QTA6R0X4');
});

describe('upsertArtifactByHash', () => {
  it('creates a new artifact without joining the cluster by default', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: '01KVFSHET98Q4N5DE5QTA6R0X4', ...baseFields }],
      });

    const result = await upsertArtifactByHash('cluster-1', baseFields);

    expect(result.created).toBe(true);
    expect(result.artifact.id).toBe('01KVFSHET98Q4N5DE5QTA6R0X4');
    expect(addClusterMember).not.toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: result.artifact.id,
        targetType: 'artifact',
      }),
    );
  });

  it('re-upserts an existing artifact without joining the cluster by default', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'artifact-existing', type: 'user_note', content_hash: baseFields.content_hash }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'artifact-existing', ...baseFields }],
      });

    const result = await upsertArtifactByHash('cluster-1', baseFields);

    expect(result.created).toBe(false);
    expect(result.artifact.id).toBe('artifact-existing');
    expect(addClusterMember).not.toHaveBeenCalled();
  });

  it('joins the cluster when addToCluster is true', async () => {
    newUlid.mockReturnValue('01KVFSHETF31J7PZ0AFPGTY179');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: '01KVFSHETF31J7PZ0AFPGTY179', ...baseFields, content_hash: 'hash-opt-in' }],
      });

    const result = await upsertArtifactByHash(
      'cluster-1',
      { ...baseFields, content_hash: 'hash-opt-in' },
      { addToCluster: true },
    );

    expect(addClusterMember).toHaveBeenCalledWith('cluster-1', {
      id: '01KVFSHETF31J7PZ0AFPGTY179',
      type: 'artifact',
    });
    expect(result.artifact.id).toBe('01KVFSHETF31J7PZ0AFPGTY179');
  });
});
