import { isUlid } from './shared/ulid.js';
import { validatePrimitiveRef } from './shared/primitive-ref.js';
import { validateAuthorChain } from './authorship/chain.js';
import { ASSERTION_STATUSES } from './shared/types.js';

export function validateAssertion(assertion) {
  if (!assertion?.id || !isUlid(assertion.id)) {
    throw new Error('assertion.id: invalid ULID');
  }
  validatePrimitiveRef(assertion.subject_ref, 'subject_ref');
  if (!assertion.predicate) {
    throw new Error('assertion.predicate is required');
  }
  const hasRef = assertion.object_ref != null;
  const hasLit = assertion.object_literal != null;
  if (hasRef === hasLit) {
    throw new Error('exactly one of object_ref or object_literal required');
  }
  if (hasRef) validatePrimitiveRef(assertion.object_ref, 'object_ref');
  if (!assertion.confidence) {
    throw new Error('assertion.confidence is required');
  }
  if (!assertion.scope) {
    throw new Error('assertion.scope is required');
  }
  if (!Array.isArray(assertion.provenance) || assertion.provenance.length === 0) {
    throw new Error('assertion.provenance is required');
  }
  const hasArtifact = assertion.provenance.some((p) => p.type === 'artifact');
  if (!hasArtifact) {
    throw new Error('provenance must terminate in at least one artifact');
  }
  if (!ASSERTION_STATUSES.includes(assertion.status)) {
    throw new Error(`invalid assertion status "${assertion.status}"`);
  }
  validateAuthorChain(assertion.author_chain);
}
