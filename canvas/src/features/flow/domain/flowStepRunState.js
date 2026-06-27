export const FLOW_STEP_RUN_STATES = Object.freeze([
  'not_started',
  'current',
  'complete',
  'needs_revision',
  'failed',
]);

export const DEFAULT_FLOW_STEP_RUN_STATE = 'not_started';

const FLOW_STEP_RUN_STATE_META = Object.freeze({
  not_started: { glyph: '○', label: 'Not started' },
  current: { glyph: '●', label: 'Current / waiting' },
  complete: { glyph: '✓', label: 'Complete' },
  needs_revision: { glyph: '↺', label: 'Needs revision' },
  failed: { glyph: '✕', label: 'Failed' },
});

/**
 * @param {unknown} value
 */
export function normalizeFlowStepRunState(value) {
  if (typeof value === 'string' && FLOW_STEP_RUN_STATES.includes(value)) {
    return value;
  }
  return DEFAULT_FLOW_STEP_RUN_STATE;
}

/**
 * @param {string} stateId
 */
export function flowStepRunStateMeta(stateId) {
  const id = normalizeFlowStepRunState(stateId);
  return { id, ...FLOW_STEP_RUN_STATE_META[id] };
}

/**
 * @param {unknown} raw
 * @param {string[]} stepIds
 */
export function normalizePathStepRunStates(raw, stepIds) {
  const members = new Set(stepIds ?? []);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  /** @type {Record<string, string>} */
  const normalized = {};
  for (const [stepId, state] of Object.entries(raw)) {
    if (!members.has(stepId)) continue;
    const normalizedState = normalizeFlowStepRunState(state);
    if (normalizedState !== DEFAULT_FLOW_STEP_RUN_STATE) {
      normalized[stepId] = normalizedState;
    }
  }
  return normalized;
}

/**
 * @param {object | null | undefined} path
 * @param {string} stepId
 */
export function resolvePathStepRunState(path, stepId) {
  if (!path?.stepIds?.includes(stepId)) return null;
  const states = path.stepRunStates ?? {};
  return normalizeFlowStepRunState(states[stepId]);
}

/**
 * @param {object | null | undefined} path
 */
export function resolvePathCurrentActiveStepId(path) {
  if (!path?.stepIds?.length) return null;
  const states = path.stepRunStates ?? {};
  for (const stepId of path.stepIds) {
    if (normalizeFlowStepRunState(states[stepId]) === 'current') {
      return stepId;
    }
  }
  return null;
}

/**
 * @param {object[]} paths
 */
export function buildPathRunStateByStepId(paths) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const path of paths ?? []) {
    for (const stepId of path.stepIds ?? []) {
      map.set(stepId, resolvePathStepRunState(path, stepId));
    }
  }
  return map;
}

/**
 * @param {unknown} value
 */
export function isValidFlowStepRunState(value) {
  return typeof value === 'string' && FLOW_STEP_RUN_STATES.includes(value);
}
