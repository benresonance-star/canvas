import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { validateAssertion } from '../../src/primitives/assertion.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';
import { primitiveRef } from '../../src/primitives/shared/primitive-ref.js';

export async function insertAssertion(clusterId, fields) {
  const id = newUlid();
  const assertion = {
    id,
    subject_ref: fields.subject_ref,
    predicate: fields.predicate,
    object_ref: fields.object_ref ?? null,
    object_literal: fields.object_literal ?? null,
    confidence: fields.confidence,
    provenance: fields.provenance,
    scope: fields.scope,
    status: fields.status || 'tentative',
    author_chain: fields.author_chain,
    created_at: fields.created_at || new Date().toISOString(),
    metadata: fields.metadata || {},
  };
  validateAssertion(assertion);

  await query(
    `INSERT INTO assertion (
      id, subject_id, subject_type, predicate, object_id, object_type, object_literal,
      confidence, scope, status, author_chain, created_at, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      assertion.subject_ref.id,
      assertion.subject_ref.type,
      assertion.predicate,
      assertion.object_ref?.id ?? null,
      assertion.object_ref?.type ?? null,
      assertion.object_literal != null ? JSON.stringify(assertion.object_literal) : null,
      JSON.stringify(assertion.confidence),
      JSON.stringify(assertion.scope),
      assertion.status,
      JSON.stringify(assertion.author_chain),
      assertion.created_at,
      JSON.stringify(assertion.metadata),
    ],
  );

  for (let i = 0; i < assertion.provenance.length; i += 1) {
    const p = assertion.provenance[i];
    await query(
      `INSERT INTO provenance (primitive_id, primitive_type, source_id, source_type, position)
       VALUES ($1,'assertion',$2,$3,$4)`,
      [id, p.id, p.type, i],
    );
  }

  if (clusterId) {
    await addClusterMember(clusterId, { id, type: 'assertion' });
  }

  await appendEvent({
    actor: assertion.author_chain[assertion.author_chain.length - 1],
    action: 'created',
    targetId: id,
    targetType: 'assertion',
    after: { predicate: assertion.predicate },
  });

  return assertion;
}

export async function listAssertionsForSubject(subjectId, subjectType) {
  const res = await query(
    `SELECT * FROM assertion WHERE subject_id = $1 AND subject_type = $2 ORDER BY created_at DESC`,
    [subjectId, subjectType],
  );
  return res.rows;
}

export function defaultConfidence() {
  return {
    version: 'confidence.v1',
    epistemic: { band: 'medium', method: 'human_attested' },
    source: { band: 'medium', tier: 'human_attested' },
    scope: { band: 'low', gaps: [] },
    aggregate: { band: 'low', policy: 'strict_min' },
    rationale: 'User-created claim',
    factors: [],
    computed_at: new Date().toISOString(),
    computed_by: { kind: 'human', id: 'user:local' },
  };
}

export function defaultScope() {
  return { profile: 'scope.generic.v0', dimensions: {} };
}
