import { describe, it, expect } from 'vitest';
import { aggregateConfidence, withComputedAggregate } from '../confidence/aggregate.js';

describe('confidence strict_min (I-09)', () => {
  it('aggregate.band equals min of three axes', () => {
    const c = {
      version: 'confidence.v1',
      epistemic: { band: 'high', method: 'direct_quote' },
      source: { band: 'high', tier: 'primary_legislative' },
      scope: { band: 'low', gaps: [] },
      aggregate: { policy: 'strict_min' },
      rationale: 'fixture',
      factors: [],
      computed_at: new Date().toISOString(),
      computed_by: { kind: 'agent', id: 'test' },
    };
    expect(aggregateConfidence(c)).toBe('low');
    expect(withComputedAggregate(c).aggregate.band).toBe('low');
  });
});
