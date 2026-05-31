import { isUlid } from './shared/ulid.js';
import { validatePrimitiveRef } from './shared/primitive-ref.js';
import { validateAuthorChain } from './authorship/chain.js';

export function validateNote(note) {
  if (!note?.id || !isUlid(note.id)) {
    throw new Error('note.id: invalid ULID');
  }
  validatePrimitiveRef(note.target_ref, 'target_ref');
  if (!note.body || typeof note.body !== 'string') {
    throw new Error('note.body is required');
  }
  validateAuthorChain(note.author_chain);
  if (note.confidence != null) {
    throw new Error('note must not carry confidence');
  }
}

export function createNote(fields) {
  const note = {
    tags: [],
    metadata: {},
    created_at: new Date().toISOString(),
    ...fields,
  };
  validateNote(note);
  return note;
}
