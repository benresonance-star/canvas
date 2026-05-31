import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { validateTask } from '../../src/primitives/task.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';

export async function insertTask(clusterId, fields) {
  const id = newUlid();
  const task = {
    id,
    intent: fields.intent,
    type: fields.type || 'query',
    assignee: fields.assignee ?? null,
    status: fields.status || 'open',
    inputs: fields.inputs || [],
    outputs: fields.outputs || [],
    parent_id: fields.parent_id ?? null,
    cluster_id: clusterId ?? fields.cluster_id ?? null,
    deadline: fields.deadline ?? null,
    created_at: fields.created_at || new Date().toISOString(),
    metadata: fields.metadata || {},
  };
  if (task.status === 'done' && task.outputs.length === 0) {
    throw new Error('done task requires at least one output');
  }
  validateTask(task);

  await query(
    `INSERT INTO task (id, intent, type, assignee, status, parent_id, cluster_id, deadline, created_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      task.intent,
      task.type,
      task.assignee ? JSON.stringify(task.assignee) : null,
      task.status,
      task.parent_id,
      task.cluster_id,
      task.deadline,
      task.created_at,
      JSON.stringify(task.metadata),
    ],
  );

  for (const ref of task.inputs) {
    await query(
      `INSERT INTO task_io (task_id, primitive_id, primitive_type, role) VALUES ($1,$2,$3,'input')`,
      [id, ref.id, ref.type],
    );
  }
  for (const ref of task.outputs) {
    await query(
      `INSERT INTO task_io (task_id, primitive_id, primitive_type, role) VALUES ($1,$2,$3,'output')`,
      [id, ref.id, ref.type],
    );
  }

  if (clusterId) {
    await addClusterMember(clusterId, { id, type: 'task' });
  }

  await appendEvent({
    actor: { kind: 'human', id: 'user:local' },
    action: 'created',
    targetId: id,
    targetType: 'task',
    after: { intent: task.intent },
  });

  return task;
}
