/**
 * @typedef {'idle'|'playing'|'paused'} SimulationStatus
 */

import { SYSTEM_OVERVIEW_ACTION_ID } from './architectureActions.js';

function isOverviewActionId(actionId) {
  return actionId === SYSTEM_OVERVIEW_ACTION_ID;
}

/**
 * @param {object} state
 * @param {'play'|'pause'|'step'|'reset'|'tick'|'selectAction'} action
 * @param {object} [payload]
 */
export function reduceSimulation(state, action, payload = {}) {
  switch (action) {
    case 'selectAction':
      return {
        ...state,
        actionId: payload.actionId ?? null,
        stepIndex: 0,
        status: 'idle',
        selectedNodeId: null,
        selectedPipeId: null,
      };
    case 'play':
      if (!state.actionId || isOverviewActionId(state.actionId)) return state;
      return { ...state, status: 'playing' };
    case 'pause':
      return { ...state, status: 'paused' };
    case 'step':
      if (!state.actionId || isOverviewActionId(state.actionId)) return state;
      return advanceStep(state, payload.maxSteps ?? Infinity);
    case 'tick':
      if (state.status !== 'playing' || !state.actionId || isOverviewActionId(state.actionId)) return state;
      return advanceStep(state, payload.maxSteps ?? Infinity);
    case 'reset':
      return {
        ...state,
        stepIndex: 0,
        status: 'idle',
        selectedNodeId: null,
        selectedPipeId: null,
      };
    case 'selectNode':
      return { ...state, selectedNodeId: payload.nodeId ?? null, selectedPipeId: null };
    case 'selectPipe':
      return { ...state, selectedPipeId: payload.pipeId ?? null, selectedNodeId: null };
    default:
      return state;
  }
}

function advanceStep(state, maxSteps) {
  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= maxSteps) {
    return { ...state, stepIndex: maxSteps - 1, status: 'idle' };
  }
  return { ...state, stepIndex: nextIndex, status: nextIndex >= maxSteps - 1 ? 'idle' : state.status };
}

export function createInitialSimulationState(actionId = null) {
  return {
    actionId,
    stepIndex: 0,
    status: /** @type {SimulationStatus} */ ('idle'),
    selectedNodeId: null,
    selectedPipeId: null,
  };
}

/**
 * @param {object} state
 * @param {import('./architectureActions.js').ArchitectureActionDef[] | import('./architectureGraphSchema.js').ArchitectureActionDef[]} actions
 */
export function getActiveSimulationStep(state, actions) {
  if (!state.actionId) return null;
  const action = actions.find((a) => a.id === state.actionId);
  if (!action?.steps?.length) return null;
  const idx = Math.min(state.stepIndex, action.steps.length - 1);
  return action.steps[idx] ?? null;
}

/**
 * @param {object} state
 * @param {import('./architectureActions.js').ArchitectureActionDef[]} actions
 */
export function getSimulationHighlight(state, actions) {
  const step = getActiveSimulationStep(state, actions);
  if (!step) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }
  return {
    nodeIds: new Set(step.activeNodeIds ?? []),
    edgeIds: new Set(step.edgeIds ?? []),
  };
}

/**
 * Current step vs rest of the action path (for diagnostics canvas tiers).
 * @param {object} state
 * @param {import('./architectureActions.js').ArchitectureActionDef[]} actions
 */
export function getSimulationPathHighlight(state, actions) {
  const empty = {
    currentNodeIds: new Set(),
    currentEdgeIds: new Set(),
    pathNodeIds: new Set(),
    pathEdgeIds: new Set(),
  };
  if (!state.actionId) return empty;
  const action = actions.find((a) => a.id === state.actionId);
  if (!action?.steps?.length) return empty;

  const currentStep = getActiveSimulationStep(state, actions);
  const currentNodeIds = new Set(currentStep?.activeNodeIds ?? []);
  const currentEdgeIds = new Set(currentStep?.edgeIds ?? []);
  const pathNodeIds = new Set();
  const pathEdgeIds = new Set();

  for (const step of action.steps) {
    for (const nodeId of step.activeNodeIds ?? []) {
      if (!currentNodeIds.has(nodeId)) pathNodeIds.add(nodeId);
    }
    for (const edgeId of step.edgeIds ?? []) {
      if (!currentEdgeIds.has(edgeId)) pathEdgeIds.add(edgeId);
    }
  }

  return { currentNodeIds, currentEdgeIds, pathNodeIds, pathEdgeIds };
}
