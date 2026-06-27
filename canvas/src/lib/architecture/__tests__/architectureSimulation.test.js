import { describe, expect, it } from 'vitest';
import {
  createInitialSimulationState,
  reduceSimulation,
  getActiveSimulationStep,
  getSimulationHighlight,
  getSimulationPathHighlight,
} from '../architectureSimulation.js';
import { ARCHITECTURE_ACTIONS, SYSTEM_OVERVIEW_ACTION_ID, getArchitectureActionById } from '../architectureActions.js';
import { ARCHITECTURE_PIPES, getArchitectureNeighborhood, getOverviewHighlight } from '../architectureGraph.js';

describe('architectureSimulation', () => {
  const addTaskAction = getArchitectureActionById('add_task');

  it('play and step advance through add_task', () => {
    let state = createInitialSimulationState('add_task');
    state = reduceSimulation(state, 'step', { maxSteps: addTaskAction.steps.length });
    expect(state.stepIndex).toBe(1);
    const step = getActiveSimulationStep(state, ARCHITECTURE_ACTIONS);
    expect(step?.label).toBeTruthy();
    const highlight = getSimulationHighlight(state, ARCHITECTURE_ACTIONS);
    expect(highlight.edgeIds.size).toBeGreaterThan(0);
  });

  it('reset returns to idle at step 0', () => {
    let state = createInitialSimulationState('add_note');
    state = reduceSimulation(state, 'step', { maxSteps: 5 });
    state = reduceSimulation(state, 'reset');
    expect(state.stepIndex).toBe(0);
    expect(state.status).toBe('idle');
  });

  it('path highlight separates current step from rest of action', () => {
    let state = createInitialSimulationState('add_task');
    const pathAtZero = getSimulationPathHighlight(state, ARCHITECTURE_ACTIONS);
    expect(pathAtZero.currentNodeIds.size).toBeGreaterThan(0);
    expect(pathAtZero.pathEdgeIds.size).toBeGreaterThan(0);
    for (const id of pathAtZero.currentEdgeIds) {
      expect(pathAtZero.pathEdgeIds.has(id)).toBe(false);
    }
    state = reduceSimulation(state, 'step', { maxSteps: addTaskAction.steps.length });
    const pathAtOne = getSimulationPathHighlight(state, ARCHITECTURE_ACTIONS);
    expect(pathAtOne.currentEdgeIds.size).toBeGreaterThan(0);
    expect(pathAtOne.pathEdgeIds.size).toBeGreaterThan(0);
  });

  it('overview highlight marks focus node and neighbors', () => {
    const pipe = ARCHITECTURE_PIPES[0];
    const highlight = getOverviewHighlight(pipe.source, ARCHITECTURE_PIPES);
    expect(highlight.currentNodeIds.has(pipe.source)).toBe(true);
    expect(highlight.pathNodeIds.has(pipe.target)).toBe(true);
    expect(highlight.pathEdgeIds.has(pipe.id)).toBe(true);
  });

  it('neighborhood returns incident pipes only', () => {
    const pipe = ARCHITECTURE_PIPES[0];
    const neighborhood = getArchitectureNeighborhood(pipe.source, ARCHITECTURE_PIPES);
    expect(neighborhood.edgeIds.has(pipe.id)).toBe(true);
    expect(neighborhood.nodeIds.has(pipe.target)).toBe(true);
  });

  it('play and step are no-ops in system overview mode', () => {
    let state = createInitialSimulationState(SYSTEM_OVERVIEW_ACTION_ID);
    state = reduceSimulation(state, 'play');
    expect(state.status).toBe('idle');
    state = reduceSimulation(state, 'step', { maxSteps: 1 });
    expect(state.stepIndex).toBe(0);
  });
});
