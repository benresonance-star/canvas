import { scopesOverlap } from '../scope/overlap.js';

/**
 * @returns {'merge' | 'contradiction' | 'distinct' | 'unrelated'}
 */
export function identityCheck(a, b) {
  if (
    a.subject_ref.id !== b.subject_ref.id ||
    a.subject_ref.type !== b.subject_ref.type ||
    a.predicate !== b.predicate
  ) {
    return 'unrelated';
  }

  if (!scopesOverlap(a.scope, b.scope)) {
    return 'distinct';
  }

  const aLit = a.object_literal;
  const bLit = b.object_literal;
  const aRef = a.object_ref;
  const bRef = b.object_ref;

  let compatible = false;
  if (aLit != null && bLit != null) {
    compatible = JSON.stringify(aLit) === JSON.stringify(bLit);
  } else if (aRef && bRef) {
    compatible =
      aRef.id === bRef.id && aRef.type === bRef.type;
  }

  if (compatible) return 'merge';
  return 'contradiction';
}
