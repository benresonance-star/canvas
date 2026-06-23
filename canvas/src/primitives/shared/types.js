export const BANDS = ['very_low', 'low', 'medium', 'high', 'certain'];

export const BAND_ORDER = {
  very_low: 0,
  low: 1,
  medium: 2,
  high: 3,
  certain: 4,
};

export const ARTIFACT_TYPES = [
  'doc',
  'image',
  'audio',
  'video',
  'transcript',
  'user_note',
  'agent_chat',
  'flow',
  'live',
  'other',
];

export const STRUCTURAL_RELATION_TYPES = [
  'references',
  'derived_from',
  'supersedes',
  'part_of',
];

export const CLAIM_RELATION_TYPES = [
  'contradicts',
  'supports',
  'refines',
  'satisfies',
  'applies_to',
];

export const RELATION_TYPES = [...STRUCTURAL_RELATION_TYPES, ...CLAIM_RELATION_TYPES];

export const ASSERTION_STATUSES = ['tentative', 'asserted', 'refuted', 'retracted'];

export const TASK_TYPES = ['query', 'check', 'derive', 'summarise', 'ingest', 'other'];

export const TASK_STATUSES = ['open', 'running', 'blocked', 'done', 'failed'];

export const CLUSTER_STATUSES = ['active', 'archived', 'sealed'];
