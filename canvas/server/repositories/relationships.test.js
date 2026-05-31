import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();

vi.mock('../db.js', () => ({ query }));
vi.mock('../events.js', () => ({ appendEvent: vi.fn() }));
vi.mock('./clusters.js', () => ({ addClusterMember: vi.fn() }));

const { findRelationship, insertRelationshipIfAbsent } = await import('./relationships.js');

const fromRef = { id: '01HNOTE0000000000000000001', type: 'artifact' };
const toRef = { id: '01HTARGET000000000000000001', type: 'artifact' };
const fields = {
  from_ref: fromRef,
  to_ref: toRef,
  type: 'references',
  provenance: [fromRef],
};

const existingRow = {
  id: '01HREL00000000000000000001',
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
