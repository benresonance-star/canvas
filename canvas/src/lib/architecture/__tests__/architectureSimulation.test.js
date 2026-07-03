import { describe, expect, it } from 'vitest';
import {
  createInitialSimulationState,
  reduceSimulation,
  getActiveSimulationStep,
  getSimulationHighlight,
  getSimulationPathHighlight,
} from '../architectureSimulation.js';
import { ARCHITECTURE_ACTIONS, SYSTEM_OVERVIEW_ACTION_ID, getArchitectureActionById } from '../architectureActions.js';
import { ARCHITECTURE_PIPES, getArchitectureInputFeedSequences, getArchitectureNeighborhood, getArchitectureNodeById, getArchitectureUpstreamFeed, getOverviewHighlight } from '../architectureGraph.js';

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

  it('extended feed-in adds upstream feeders beyond direct neighbors', () => {
    const pipe = ARCHITECTURE_PIPES.find((entry) => entry.id === 'pipe-flowEditor-apiStudios');
    expect(pipe).toBeTruthy();
    const base = getOverviewHighlight(pipe.target, ARCHITECTURE_PIPES);
    const extended = getOverviewHighlight(pipe.target, ARCHITECTURE_PIPES, { extendedFeedIn: true });
    expect(extended.pathNodeIds.size).toBeGreaterThanOrEqual(base.pathNodeIds.size);
    expect(extended.pathNodeIds.has('studioDashboard')).toBe(true);
    expect(extended.pathNodeIds.has('canvas')).toBe(true);
  });

  it('upstream feed follows pipe direction only', () => {
    const upstream = getArchitectureUpstreamFeed('apiStudios', ARCHITECTURE_PIPES, { minDepth: 1 });
    expect(upstream.nodeIds.has('flowEditor')).toBe(true);
    expect(upstream.nodeIds.has('dbStudio')).toBe(false);
  });

  it('input feed sequences list upstream paths per incoming pipe', () => {
    const sequences = getArchitectureInputFeedSequences(
      'apiStudios',
      ARCHITECTURE_PIPES,
      getArchitectureNodeById,
    );
    expect(sequences).toHaveLength(1);
    expect(sequences[0].input.name).toBe('studioInput');
    expect(sequences[0].paths.length).toBeGreaterThanOrEqual(3);
    const invokePath = sequences[0].paths.find((path) => path.pipeId === 'pipe-flowEditor-apiStudios');
    expect(invokePath).toBeTruthy();
    const labels = invokePath.steps.map((step) => step.nodeId);
    expect(labels[labels.length - 1]).toBe('apiStudios');
    expect(labels).toContain('flowEditor');
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

  it('selectPipe keeps the selected node', () => {
    let state = createInitialSimulationState(SYSTEM_OVERVIEW_ACTION_ID);
    state = reduceSimulation(state, 'selectNode', { nodeId: 'apiStudios' });
    state = reduceSimulation(state, 'selectPipe', { pipeId: 'pipe-apiStudios-dbStudio' });
    expect(state.selectedNodeId).toBe('apiStudios');
    expect(state.selectedPipeId).toBe('pipe-apiStudios-dbStudio');
  });
});
