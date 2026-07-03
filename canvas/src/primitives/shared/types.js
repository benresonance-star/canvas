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
  '3d_model',
  'transcript',
  'user_note',
  'user_task',
  'agent',
  'agent_chat',
  'flow',
  'studio',
  'live',
  'exploration',
  'run',
  'report',
  'design_option',
  'decision',
  'function',
  'state_machine',
  'other',
];

export const STRUCTURAL_RELATION_TYPES = [
  'references',
  'depends_on',
  'derived_from',
  'supersedes',
  'contains',
  'part_of',
  'produces',
  'prompt_input_to',
  'reference_input_to',
  'input_to',
  'output_of',
  'generated_from',
  'generated_by',
  'created_by_agent',
  'created_by_transformer',
  'version_of',
  'variant_of',
  'uses',
  'uses_tool',
  'has_skill',
  'has_rule',
  'has_instruction',
  'evidences',
  'blocks',
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
