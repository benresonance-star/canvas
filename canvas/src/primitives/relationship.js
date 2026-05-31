import { isUlid } from './shared/ulid.js';
import { validatePrimitiveRef } from './shared/primitive-ref.js';
import {
  RELATION_TYPES,
  STRUCTURAL_RELATION_TYPES,
  CLAIM_RELATION_TYPES,
} from './shared/types.js';

export function isStructuralRelation(type) {
  return STRUCTURAL_RELATION_TYPES.includes(type);
}

export function isClaimRelation(type) {
  return CLAIM_RELATION_TYPES.includes(type);
}

export function validateRelationship(rel) {
  if (!rel?.id || !isUlid(rel.id)) {
    throw new Error('relationship.id: invalid ULID');
  }
  validatePrimitiveRef(rel.from_ref, 'from_ref');
  validatePrimitiveRef(rel.to_ref, 'to_ref');
  if (!RELATION_TYPES.includes(rel.type)) {
    throw new Error(`relationship.type: invalid "${rel.type}"`);
  }
  if (rel.from_ref.id === rel.to_ref.id && rel.from_ref.type === rel.to_ref.type) {
    throw new Error('self-loops disallowed');
  }
  if (isClaimRelation(rel.type) && !rel.confidence) {
    throw new Error('claim-bearing relationship requires confidence');
  }
  if (isStructuralRelation(rel.type) && rel.confidence != null) {
    throw new Error('structural relationship must not carry confidence');
  }
  if (!Array.isArray(rel.provenance) || rel.provenance.length === 0) {
    throw new Error('relationship.provenance is required');
  }
  if (rel.type === 'contradicts' && rel.bidirectional !== true) {
    // bidirectional allowed for contradicts only per spec
  }
}

export function createRelationship(fields) {
  const rel = {
    bidirectional: false,
    metadata: {},
    created_at: new Date().toISOString(),
    ...fields,
  };
  validateRelationship(rel);
  return rel;
}
