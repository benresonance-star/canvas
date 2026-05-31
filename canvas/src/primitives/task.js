import { isUlid } from './shared/ulid.js';
import { TASK_TYPES, TASK_STATUSES } from './shared/types.js';

export function validateTask(task) {
  if (!task?.id || !isUlid(task.id)) throw new Error('task.id: invalid ULID');
  if (!task.intent) throw new Error('task.intent is required');
  if (!TASK_TYPES.includes(task.type)) throw new Error('invalid task type');
  if (!TASK_STATUSES.includes(task.status)) throw new Error('invalid task status');
  if (task.status === 'done' && (!task.outputs || task.outputs.length === 0)) {
    throw new Error('done task requires at least one output');
  }
}
