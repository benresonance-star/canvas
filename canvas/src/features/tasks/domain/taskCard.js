import { DEFAULT_USER_TASK_STATUS, parseUserTask } from './userTaskContent.js';

export function resolveUserTaskStatus(card) {
  if (card?.taskStatus === 'important' || card?.taskStatus === 'general') {
    return card.taskStatus;
  }
  const pinned = card?.versions?.find((v) => v.version === card.pinnedVersion)
    ?? card?.versions?.[0];
  if (pinned?.content) {
    return parseUserTask(pinned.content).taskStatus;
  }
  return DEFAULT_USER_TASK_STATUS;
}

export function getUserTaskHeaderClass(taskStatus) {
  if (taskStatus === 'important') {
    return 'bg-[#4a1515] border-[#6b2020]';
  }
  return 'bg-[#4a3010] border-[#6b4020]';
}

export function sortUserTasks(tasks) {
  return [...(tasks ?? [])].sort((a, b) => {
    const aImportant = resolveUserTaskStatus(a) === 'important' ? 0 : 1;
    const bImportant = resolveUserTaskStatus(b) === 'important' ? 0 : 1;
    if (aImportant !== bImportant) return aImportant - bImportant;
    return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  });
}

export function countOpenUserTasks(tasks) {
  return tasks?.length ?? 0;
}

export function getUserTaskBodyPreview(card) {
  const pinned = card?.versions?.find((v) => v.version === card.pinnedVersion)
    ?? card?.versions?.[0];
  return parseUserTask(pinned?.content ?? '').body.trim();
}

export function partitionUserTasksByStatus(tasks) {
  const sorted = sortUserTasks(tasks);
  const important = [];
  const general = [];
  for (const task of sorted) {
    if (resolveUserTaskStatus(task) === 'important') important.push(task);
    else general.push(task);
  }
  return { important, general };
}
