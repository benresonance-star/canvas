import { resolveBimAssemblyElementIds, resolveResultSetElementIds } from './bimResultSets.js';

export const BIM_4D_SEQUENCE_LIMIT = 12;
export const BIM_4D_TASK_LIMIT = 200;
export const BIM_4D_TASK_STATUSES = ['notStarted', 'inProgress', 'complete', 'blocked'];
export const BIM_4D_VISIBILITY_MODES = ['highlight', 'ghostFuture', 'hideFuture'];

function uniqueStrings(values, limit = 10000) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, limit);
}

function safeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function safeColor(value, fallback = '#38bdf8') {
  const color = String(value ?? fallback);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function normalizeTask(entry, index = 0) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const order = Number.isFinite(Number(entry.order)) ? Number(entry.order) : index;
  return {
    id: String(entry.id ?? `task-${index}`),
    name: String(entry.name ?? `Task ${index + 1}`).slice(0, 80),
    order,
    plannedStart: safeIsoDate(entry.plannedStart),
    plannedFinish: safeIsoDate(entry.plannedFinish),
    actualStart: safeIsoDate(entry.actualStart),
    actualFinish: safeIsoDate(entry.actualFinish),
    status: BIM_4D_TASK_STATUSES.includes(entry.status) ? entry.status : 'notStarted',
    priority: entry.priority == null ? null : String(entry.priority).slice(0, 40),
    isMilestone: entry.isMilestone === true,
    taskType: entry.taskType == null ? null : String(entry.taskType).slice(0, 64),
    elementIds: uniqueStrings(entry.elementIds),
    assemblyIds: uniqueStrings(entry.assemblyIds),
    resultSetIds: uniqueStrings(entry.resultSetIds, 1000),
    color: safeColor(entry.color),
    visibilityMode: BIM_4D_VISIBILITY_MODES.includes(entry.visibilityMode) ? entry.visibilityMode : 'highlight',
    notes: String(entry.notes ?? '').slice(0, 1000),
  };
}

export function normalizeBim4dSequences(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const tasks = Array.isArray(entry.tasks)
        ? entry.tasks.map(normalizeTask).filter(Boolean).slice(0, BIM_4D_TASK_LIMIT)
        : [];
      if (tasks.length === 0 && !entry.id && !entry.name) return null;
      const createdAt = safeIsoDate(entry.createdAt, new Date(0).toISOString());
      return {
        id: String(entry.id ?? `sequence-${index}`),
        name: String(entry.name ?? `Sequence ${index + 1}`).slice(0, 80),
        createdAt,
        updatedAt: safeIsoDate(entry.updatedAt, createdAt),
        tasks: tasks.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
        playback: {
          playing: entry.playback?.playing === true,
          speed: Number.isFinite(Number(entry.playback?.speed)) ? Math.max(0.25, Math.min(4, Number(entry.playback.speed))) : 1,
        },
        notes: String(entry.notes ?? '').slice(0, 1000),
      };
    })
    .filter(Boolean)
    .slice(0, BIM_4D_SEQUENCE_LIMIT);
}

export function resolveBim4dTaskElementIds(task, resultSets = [], assemblyMembers = []) {
  if (!task) return [];
  return uniqueStrings([
    ...(task.elementIds ?? []),
    ...resolveBimAssemblyElementIds(task.assemblyIds ?? [], assemblyMembers),
    ...resolveResultSetElementIds(task.resultSetIds ?? [], resultSets, assemblyMembers),
  ]);
}

export function classifyBim4dTasks(sequence, activeTaskId = null) {
  const tasks = sequence?.tasks ?? [];
  const activeIndex = Math.max(0, tasks.findIndex((task) => task.id === activeTaskId));
  return tasks.map((task, index) => ({
    ...task,
    timelineState: index < activeIndex ? 'completed' : index === activeIndex ? 'current' : 'upcoming',
  }));
}

export function createBim4dSequence({ name = 'Construction sequence', now = new Date().toISOString() } = {}) {
  return {
    id: `bim-4d-sequence:${now}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    playback: { playing: false, speed: 1 },
    notes: '',
  };
}

export function createBim4dTask({
  name = 'Linked task',
  order = 0,
  elementIds = [],
  resultSetIds = [],
  color = '#38bdf8',
} = {}) {
  return normalizeTask({
    id: `bim-4d-task:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    order,
    elementIds,
    resultSetIds,
    color,
  }, order);
}
