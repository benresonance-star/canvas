import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  ARCHITECTURE_ACTIONS,
  ARCHITECTURE_PIPES,
  createInitialSimulationState,
  reduceSimulation,
  getActiveSimulationStep,
  getSimulationPathHighlight,
  getOverviewHighlight,
  getActionTouchedNodeIds,
  isOverviewAction,
} from '../../../lib/architecture/index.js';

const TICK_MS = 1200;

function simulationReducer(state, event) {
  const { type, ...payload } = event;
  return reduceSimulation(state, type, payload);
}

export function useDiagnosticsSimulation(initialActionId = 'add_task') {
  const [state, dispatch] = useReducer(
    simulationReducer,
    initialActionId,
    (actionId) => createInitialSimulationState(actionId),
  );
  const timerRef = useRef(null);

  const action = useMemo(
    () => ARCHITECTURE_ACTIONS.find((a) => a.id === state.actionId) ?? null,
    [state.actionId],
  );

  const isOverviewMode = isOverviewAction(action);

  const step = useMemo(
    () => (isOverviewMode ? null : getActiveSimulationStep(state, ARCHITECTURE_ACTIONS)),
    [isOverviewMode, state],
  );

  const pathHighlight = useMemo(() => {
    if (isOverviewMode) {
      return getOverviewHighlight(state.selectedNodeId, ARCHITECTURE_PIPES);
    }
    return getSimulationPathHighlight(state, ARCHITECTURE_ACTIONS);
  }, [isOverviewMode, state.selectedNodeId, state.actionId, state.stepIndex]);

  const actionTouchedNodeIds = useMemo(() => {
    if (isOverviewMode || !action) return null;
    return getActionTouchedNodeIds(action);
  }, [isOverviewMode, action]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (isOverviewMode || state.status !== 'playing' || !action?.steps?.length) return undefined;
    timerRef.current = setInterval(() => {
      dispatch({ type: 'tick', maxSteps: action.steps.length });
    }, TICK_MS);
    return clearTimer;
  }, [state.status, action, isOverviewMode, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const selectAction = useCallback((actionId) => {
    dispatch({ type: 'selectAction', actionId });
  }, []);

  const play = useCallback(() => dispatch({ type: 'play' }), []);
  const pause = useCallback(() => dispatch({ type: 'pause' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const stepOnce = useCallback(() => {
    if (!action?.steps?.length) return;
    dispatch({ type: 'step', maxSteps: action.steps.length });
  }, [action]);

  const selectNode = useCallback((nodeId) => {
    dispatch({ type: 'selectNode', nodeId });
  }, []);

  const selectPipe = useCallback((pipeId) => {
    dispatch({ type: 'selectPipe', pipeId });
  }, []);

  return {
    state,
    action,
    step,
    pathHighlight,
    actionTouchedNodeIds,
    isOverviewMode,
    selectAction,
    play,
    pause,
    reset,
    stepOnce,
    selectNode,
    selectPipe,
    isPlaying: state.status === 'playing',
    stepIndex: state.stepIndex,
    stepCount: action?.steps?.length ?? 0,
    selectedNodeId: state.selectedNodeId,
    selectedPipeId: state.selectedPipeId,
  };
}
