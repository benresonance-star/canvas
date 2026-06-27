import { describe, expect, it } from 'vitest';
import {
  createDefaultBeatPattern,
  createDefaultDescriptorGraph,
  createDefaultSpaceState,
  createDefaultTemporalState,
  createTemporalTopologyPreset,
  deriveSpaceFromDescriptors,
  deriveTemporalFromDescriptors,
  driveDescriptorMappings,
  analyzeMusicClutter,
  createDefaultTransportState,
  ticksToBarBeatTick,
  updateDescriptorValue,
  validateBeatPattern,
} from '../../../../packages/music-core/src/index.js';
import { createDefaultBeatAgentState } from '../agents/beat/domain/beatAgentState.js';
import { applyBeatAgentJsonPatch } from '../agents/beat/domain/beatAi.js';
import {
  toggleBeatAgentStepState,
  updateBeatTransportSettingsState,
  updateBeatTrackSynthState,
} from '../agents/beat/domain/beatRuntimeState.js';
import {
  normalizeBeatPatternSynth,
  normalizeBeatTrackSynth,
} from '../agents/beat/domain/beatTrackSynth.js';

describe('music core MVP', () => {
  it('creates a valid default beat pattern', () => {
    const pattern = createDefaultBeatPattern();
    expect(validateBeatPattern(pattern)).toEqual({ ok: true });
    expect(pattern.tracks.find((track) => track.id === 'kick').steps[0].active).toBe(true);
  });

  it('defaults Beat Agents to an unsynced clock', () => {
    const state = createDefaultBeatAgentState();
    expect(state.clockSync).toBe(false);
  });

  it('adds valid synth defaults to Beat Agent tracks', () => {
    const state = createDefaultBeatAgentState();
    for (const track of state.pattern.tracks) {
      expect(track.synth).toEqual(expect.objectContaining({
        gain: expect.any(Number),
        attackMs: expect.any(Number),
        decayMs: expect.any(Number),
        pitch: expect.any(Number),
        tone: expect.any(Number),
        distortion: expect.any(Number),
      }));
    }
  });

  it('converts ticks to bar beat tick positions', () => {
    const transport = createDefaultTransportState();
    expect(ticksToBarBeatTick(0, transport)).toEqual({ bar: 1, beat: 1, tick: 0 });
    expect(ticksToBarBeatTick(960, transport)).toEqual({ bar: 1, beat: 2, tick: 0 });
  });

  it('applies validated beat AI patches only to pattern paths', () => {
    const state = createDefaultBeatAgentState();
    const result = applyBeatAgentJsonPatch(state, [
      { op: 'replace', path: '/pattern/tracks/0/steps/1/active', value: true },
    ]);
    expect(result.ok).toBe(true);
    expect(result.state.pattern.tracks[0].steps[1].active).toBe(true);
  });

  it('rejects AI patches outside the pattern', () => {
    const state = createDefaultBeatAgentState();
    const result = applyBeatAgentJsonPatch(state, [
      { op: 'replace', path: '/name', value: 'Oops' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('toggles Beat Agent steps without mutating the previous state', () => {
    const state = createDefaultBeatAgentState();
    const original = state.pattern.tracks[0].steps[1].active;
    const result = toggleBeatAgentStepState(state, state.pattern.tracks[0].id, 1);
    expect(result.ok).toBe(true);
    expect(result.state.pattern.tracks[0].steps[1].active).toBe(!original);
    expect(state.pattern.tracks[0].steps[1].active).toBe(original);
  });

  it('rejects invalid Beat Agent step toggles', () => {
    const state = createDefaultBeatAgentState();
    const result = toggleBeatAgentStepState(state, 'missing-track', 0);
    expect(result).toEqual({ ok: false, reason: 'Step not found', state });
  });

  it('clamps Beat Agent track synth updates', () => {
    const state = createDefaultBeatAgentState();
    const track = state.pattern.tracks[0];
    const result = updateBeatTrackSynthState(state, track.id, {
      gain: 4,
      attackMs: -10,
      decayMs: 5000,
      pitch: 99,
      tone: -1,
      distortion: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.state.pattern.tracks[0].synth).toEqual(expect.objectContaining({
      gain: 1.5,
      attackMs: 0,
      decayMs: 800,
      pitch: 24,
      tone: 0,
      distortion: 1,
    }));
  });

  it('updates one instrument synth without mutating other tracks', () => {
    const state = createDefaultBeatAgentState();
    const target = state.pattern.tracks[0];
    const untouched = state.pattern.tracks[1].synth;
    const result = updateBeatTrackSynthState(state, target.id, { tone: 0.22 });
    expect(result.ok).toBe(true);
    expect(result.state.pattern.tracks[0].synth.tone).toBe(0.22);
    expect(result.state.pattern.tracks[1].synth).toEqual(untouched);
    expect(state.pattern.tracks[0].synth.tone).not.toBe(0.22);
  });

  it('persists Beat Agent transport settings such as BPM in state', () => {
    const state = createDefaultBeatAgentState();
    const result = updateBeatTransportSettingsState(state, {
      bpm: 142,
      swing: 0.12,
      loopEndBar: 4,
    });
    expect(result.ok).toBe(true);
    expect(result.state.transport.bpm).toBe(142);
    expect(result.state.transport.swing).toBe(0.12);
    expect(result.state.transport.loopEndBar).toBe(4);
    expect(result.state).not.toBe(state);
    expect(result.state.transport.updatedAt).toEqual(expect.any(String));
  });

  it('preserves Beat Agent descriptor dependency mappings in state', () => {
    const graph = createDefaultDescriptorGraph();
    graph.descriptors.Energy.mappings.gain = 0.777;
    const state = createDefaultBeatAgentState({ descriptorGraph: graph });
    expect(state.descriptorGraph.descriptors.Energy.mappings.gain).toBe(0.777);
  });

  it('normalizes existing patterns that do not have synth settings', () => {
    const pattern = createDefaultBeatPattern();
    delete pattern.tracks[0].synth;
    const normalized = normalizeBeatPatternSynth(pattern);
    expect(normalized.tracks[0].synth).toEqual(normalizeBeatTrackSynth(pattern.tracks[0]));
  });

  it('creates descriptor graphs with the required musical descriptors first', () => {
    const graph = createDefaultDescriptorGraph();
    expect(Object.keys(graph.descriptors).slice(0, 3)).toEqual(['Energy', 'Tension', 'Space']);
    const result = updateDescriptorValue(graph, 'Dreaminess', 0.9);
    expect(result.ok).toBe(true);
    expect(result.graph.descriptors.Dreaminess.value).toBe(0.9);
  });

  it('drives descriptor sub-variables from descriptor values while allowing direct overrides', () => {
    const graph = createDefaultDescriptorGraph();
    const descriptor = graph.descriptors.Energy;
    const drivenLow = driveDescriptorMappings(descriptor, 0.1);
    const drivenHigh = driveDescriptorMappings(descriptor, 0.9);
    expect(drivenHigh.gain).toBeGreaterThan(drivenLow.gain);
    const manual = {
      ...descriptor,
      mappings: {
        ...drivenHigh,
        gain: 0.123,
      },
    };
    expect(manual.mappings.gain).toBe(0.123);
  });

  it('derives space and temporal states from descriptors', () => {
    let graph = createDefaultDescriptorGraph();
    graph = updateDescriptorValue(graph, 'Space', 0.9).graph;
    graph = updateDescriptorValue(graph, 'Persistence', 0.85).graph;
    const space = deriveSpaceFromDescriptors(createDefaultSpaceState(), graph);
    const temporal = deriveTemporalFromDescriptors(createDefaultTemporalState(), graph);
    expect(space.roomSize).toBeGreaterThan(0.6);
    expect(temporal.feedback).toBeGreaterThan(0.5);
  });

  it('creates presets for all advanced temporal topologies', () => {
    expect(createTemporalTopologyPreset('tape').topology).toBe('tape');
    expect(createTemporalTopologyPreset('bbd').tone.highCutHz).toBeLessThan(9000);
    expect(createTemporalTopologyPreset('freeze').feedback).toBeGreaterThan(0.8);
    expect(createTemporalTopologyPreset('swarm').voices).toBe(8);
  });

  it('reflects clutter risk from descriptors and wet temporal state', () => {
    let graph = createDefaultDescriptorGraph();
    graph = updateDescriptorValue(graph, 'Complexity', 0.9).graph;
    graph = updateDescriptorValue(graph, 'Pressure', 0.9).graph;
    const analysis = analyzeMusicClutter({
      descriptorGraph: graph,
      temporalState: createDefaultTemporalState({ feedback: 0.85, wet: 0.7 }),
      performerStates: [{ density: 0.9 }],
    });
    expect(analysis.risk).toBe('high');
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });
});
