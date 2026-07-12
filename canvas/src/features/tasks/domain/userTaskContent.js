export const USER_TASK_STATUSES = ['important', 'general'];
export const DEFAULT_USER_TASK_STATUS = 'general';

export function serializeUserTask({ taskStatus = DEFAULT_USER_TASK_STATUS, body = '' }) {
  const status = USER_TASK_STATUSES.includes(taskStatus)
    ? taskStatus
    : DEFAULT_USER_TASK_STATUS;
  return `---\ntaskStatus: ${status}\n---\n\n${body}`;
}

export function parseUserTask(content) {
  const raw = content ?? '';
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { taskStatus: DEFAULT_USER_TASK_STATUS, body: raw };
  }
  const closeIndex = normalized.indexOf('\n---\n', 4);
  if (closeIndex < 0) {
    return { taskStatus: DEFAULT_USER_TASK_STATUS, body: raw };
  }
  const frontmatter = normalized.slice(4, closeIndex);
  const body = normalized.slice(closeIndex + 5).replace(/^\n/, '');
  const statusMatch = /taskStatus:\s*(\w+)/.exec(frontmatter);
  const taskStatus = statusMatch && USER_TASK_STATUSES.includes(statusMatch[1])
    ? statusMatch[1]
    : DEFAULT_USER_TASK_STATUS;
  return { taskStatus, body };
}
