import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();

vi.mock('../db.js', () => ({ query }));
vi.mock('../events.js', () => ({ appendEvent: vi.fn() }));
vi.mock('./clusters.js', () => ({ addClusterMember: vi.fn() }));

const { addClusterMember } = await import('./clusters.js');
const { findRelationship, insertRelationshipIfAbsent, insertRelationship } = await import('./relationships.js');

const fromRef = { id: '01KVFSHET98Q4N5DE5QTA6R0X4', type: 'artifact' };
const toRef = { id: '01KVFSHETF31J7PZ0AFPGTY179', type: 'artifact' };
const fields = {
  from_ref: fromRef,
  to_ref: toRef,
  type: 'references',
  provenance: [fromRef],
};

const existingRow = {
  id: '01KVFSHSNFRT89NTZXB41JX417',
  from_id: fromRef.id,
  from_type: fromRef.type,
  to_id: toRef.id,
  to_type: toRef.type,
  type: 'references',
  confidence: null,
  bidirectional: false,
  created_at: '2025-01-01T00:00:00.000Z',
  metadata: {},
};

beforeEach(() => {
  query.mockReset();
  addClusterMember.mockReset();
});

describe('insertRelationshipIfAbsent', () => {
  it('returns existing relationship without creating when endpoints match', async () => {
    query.mockResolvedValueOnce({ rows: [existingRow] });

    const result = await insertRelationshipIfAbsent('cluster-1', fields);

    expect(result.created).toBe(false);
    expect(result.relationship.id).toBe(existingRow.id);
    expect(result.relationship.from_ref).toEqual(fromRef);
    expect(result.relationship.to_ref).toEqual(toRef);
    expect(query).toHaveBeenCalledTimes(1);
    expect(addClusterMember).toHaveBeenCalledWith('cluster-1', {
      id: existingRow.id,
      type: 'relationship',
    });
  });

  it('allows different relationship types between same endpoints', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await findRelationship({
      from_ref: fromRef,
      to_ref: toRef,
      type: 'part_of',
    });

    expect(result).toBeNull();
    expect(query.mock.calls[0][1][4]).toBe('part_of');
  });
});

describe('insertRelationship', () => {
  it('still joins the cluster when a new relationship is created', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await insertRelationship('cluster-1', fields);

    expect(addClusterMember).toHaveBeenCalledWith('cluster-1', {
      id: expect.any(String),
      type: 'relationship',
    });
  });
});
