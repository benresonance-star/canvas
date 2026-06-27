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
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) {
    return { taskStatus: DEFAULT_USER_TASK_STATUS, body: raw };
  }
  const frontmatter = match[1];
  const body = (match[2] ?? '').replace(/^\r?\n/, '');
  const statusMatch = /taskStatus:\s*(\w+)/.exec(frontmatter);
  const taskStatus = statusMatch && USER_TASK_STATUSES.includes(statusMatch[1])
    ? statusMatch[1]
    : DEFAULT_USER_TASK_STATUS;
  return { taskStatus, body };
}
