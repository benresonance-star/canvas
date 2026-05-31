import { isUlid } from './ulid.js';

export const PRIMITIVE_TYPES = [
  'artifact',
  'note',
  'assertion',
  'relationship',
  'task',
  'cluster',
];

/**
 * @typedef {{ id: string, type: string }} PrimitiveRef
 */

export function primitiveRef(id, type) {
  return { id, type };
}

export function validatePrimitiveRef(ref, label = 'ref') {
  if (!ref || typeof ref !== 'object') {
    throw new Error(`${label}: must be an object`);
  }
  if (!isUlid(ref.id)) {
    throw new Error(`${label}.id: invalid ULID`);
  }
  if (!PRIMITIVE_TYPES.includes(ref.type)) {
    throw new Error(`${label}.type: unknown primitive type "${ref.type}"`);
  }
}

export function refKey(ref) {
  return `${ref.type}:${ref.id}`;
}
