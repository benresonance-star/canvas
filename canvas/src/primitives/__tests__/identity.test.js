import { describe, it, expect } from 'vitest';
import { identityCheck } from '../identity/match.js';
import { primitiveRef } from '../shared/primitive-ref.js';

describe('identity NSW/VIC (I-14)', () => {
  const base = {
    subject_ref: primitiveRef('01AAAAAAAAAAAAAAAAAAAAAA', 'artifact'),
    predicate: 'applies_to',
    object_literal: true,
    confidence: { version: 'confidence.v1' },
    provenance: [primitiveRef('01BBBBBBBBBBBBBBBBBBBBBB', 'artifact')],
    author_chain: [{ kind: 'human', id: 'u', action: 'created', at: '2025-01-01T00:00:00Z' }],
    status: 'asserted',
  };

  it('non-overlapping jurisdictional scope is distinct', () => {
    const a = {
      ...base,
      scope: {
        profile: 'scope.ncc.v1',
        dimensions: { state_jurisdiction: { kind: 'single', value: 'NSW' } },
      },
    };
    const b = {
      ...base,
      scope: {
        profile: 'scope.ncc.v1',
        dimensions: { state_jurisdiction: { kind: 'single', value: 'VIC' } },
      },
    };
    expect(identityCheck(a, b)).toBe('distinct');
  });
});
