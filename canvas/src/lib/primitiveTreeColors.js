import {
  ARTIFACT_TYPES,
  RELATION_TYPES,
  ASSERTION_STATUSES,
  TASK_TYPES,
} from '../primitives/shared/types.js';

const KIND_COLORS = {
  artifact: '#64748b',
  note: '#8b5cf6',
  relationship: '#f59e0b',
  assertion: '#10b981',
  task: '#06b6d4',
  cluster: '#6366f1',
  event: '#94a3b8',
};

const ARTIFACT_TYPE_COLORS = {
  doc: '#ef4444',
  image: '#3b82f6',
  audio: '#22c55e',
  video: '#f97316',
  transcript: '#a855f7',
  user_note: '#eab308',
  agent_chat: '#0ea5e9',
  flow: '#b45309',
  other: '#64748b',
};

const RELATION_TYPE_COLORS = {
  references: '#f59e0b',
  derived_from: '#d97706',
  supersedes: '#78716c',
  part_of: '#84cc16',
  contradicts: '#ef4444',
  supports: '#22c55e',
  refines: '#14b8a6',
  satisfies: '#06b6d4',
  applies_to: '#8b5cf6',
};

const ASSERTION_STATUS_COLORS = {
  tentative: '#94a3b8',
  asserted: '#22c55e',
  refuted: '#ef4444',
  retracted: '#64748b',
};

const TASK_TYPE_COLORS = {
  query: '#3b82f6',
  check: '#22c55e',
  derive: '#8b5cf6',
  summarise: '#06b6d4',
  ingest: '#f97316',
  other: '#64748b',
};

const EVENT_ACTION_COLORS = {
  created: '#22c55e',
  updated: '#3b82f6',
  archived: '#94a3b8',
};

const FALLBACK = '#64748b';

export function getPrimitiveKindColor(kind) {
  return KIND_COLORS[kind] ?? FALLBACK;
}

export function getArtifactTypeColor(type) {
  return ARTIFACT_TYPE_COLORS[type] ?? FALLBACK;
}

export function getRelationTypeColor(type) {
  return RELATION_TYPE_COLORS[type] ?? FALLBACK;
}

export function getAssertionStatusColor(status) {
  return ASSERTION_STATUS_COLORS[status] ?? FALLBACK;
}

export function getTaskTypeColor(type) {
  return TASK_TYPE_COLORS[type] ?? FALLBACK;
}

export function getEventActionColor(action) {
  return EVENT_ACTION_COLORS[action] ?? FALLBACK;
}

export function getSubtypeColor(sectionId, subtype) {
  switch (sectionId) {
    case 'artifacts':
      return getArtifactTypeColor(subtype);
    case 'relationships':
      return getRelationTypeColor(subtype);
    case 'assertions':
      return getAssertionStatusColor(subtype);
    case 'tasks':
      return getTaskTypeColor(subtype);
    case 'events':
      return getEventActionColor(subtype);
    default:
      return FALLBACK;
  }
}

/** Legend entries grouped by workspace section */
export function getLegendEntries() {
  return [
    {
      sectionId: 'clusters',
      label: 'Clusters',
      kindColor: KIND_COLORS.cluster,
      subtypes: [],
    },
    {
      sectionId: 'artifacts',
      label: 'Artifacts',
      kindColor: KIND_COLORS.artifact,
      subtypes: ARTIFACT_TYPES.map((t) => ({
        id: t,
        label: t,
        color: getArtifactTypeColor(t),
      })),
    },
    {
      sectionId: 'notes',
      label: 'Notes',
      kindColor: KIND_COLORS.note,
      subtypes: [],
    },
    {
      sectionId: 'relationships',
      label: 'Relationships',
      kindColor: KIND_COLORS.relationship,
      subtypes: RELATION_TYPES.map((t) => ({
        id: t,
        label: t,
        color: getRelationTypeColor(t),
      })),
    },
    {
      sectionId: 'assertions',
      label: 'Assertions',
      kindColor: KIND_COLORS.assertion,
      subtypes: ASSERTION_STATUSES.map((t) => ({
        id: t,
        label: t,
        color: getAssertionStatusColor(t),
      })),
    },
    {
      sectionId: 'tasks',
      label: 'Tasks',
      kindColor: KIND_COLORS.task,
      subtypes: TASK_TYPES.map((t) => ({
        id: t,
        label: t,
        color: getTaskTypeColor(t),
      })),
    },
    {
      sectionId: 'events',
      label: 'Events',
      kindColor: KIND_COLORS.event,
      subtypes: Object.keys(EVENT_ACTION_COLORS).map((t) => ({
        id: t,
        label: t,
        color: getEventActionColor(t),
      })),
    },
  ];
}
