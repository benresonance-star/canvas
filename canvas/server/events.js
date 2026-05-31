import { query } from './db.js';
import { newUlid } from '../src/primitives/shared/ulid.js';

export async function appendEvent({ actor, action, targetId, targetType, before, after }) {
  const id = newUlid();
  await query(
    `INSERT INTO canvas_event (id, occurred_at, actor, action, target_id, target_type, before, after)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
    [
      id,
      JSON.stringify(actor),
      action,
      targetId,
      targetType,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
  return id;
}
