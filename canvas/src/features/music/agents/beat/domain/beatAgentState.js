import {
  createDefaultBeatPattern,
  validateBeatPattern,
} from '../../../../../../packages/music-core/src/index.js';
import { normalizeBeatPatternSynth } from './beatTrackSynth.js';

export function createDefaultBeatAgentState(overrides = {}) {
  const pattern = normalizeBeatPatternSynth(overrides.pattern ?? createDefaultBeatPattern());
  return {
    schemaVersion: 1,
    agentType: 'beat',
    name: overrides.name ?? 'Beat Agent',
    status: overrides.status ?? 'draft',
    syncMode: overrides.syncMode ?? 'project',
    clockSync: overrides.clockSync ?? false,
    transport: overrides.transport ?? null,
    samples: [
      { id: 'kick', name: 'Kick', role: 'kick', filePath: 'generated://kick', gain: 1 },
      { id: 'snare', name: 'Snare', role: 'snare', filePath: 'generated://snare', gain: 0.9 },
      { id: 'hat-closed', name: 'Closed Hat', role: 'hat', filePath: 'generated://hat', gain: 0.55 },
      { id: 'clap', name: 'Clap', role: 'clap', filePath: 'generated://clap', gain: 0.75 },
    ],
    parameters: {
      swing: 0,
      gain: 0.8,
    },
    locks: {},
    effects: [],
    variations: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
    pattern,
  };
}

export function validateBeatAgentState(state) {
  if (!state || state.agentType !== 'beat') {
    return { ok: false, reason: 'Beat Agent state is required' };
  }
  return validateBeatPattern(state.pattern);
}

export function summarizeBeatBlackboard(state) {
  const pattern = state?.pattern;
  if (!pattern?.tracks) return {};
  const summary = {};
  for (const track of pattern.tracks) {
    const active = track.steps.filter((step) => step.active).length;
    summary[track.role || track.id] = {
      activeSteps: active,
      density: active / Math.max(1, pattern.stepCount),
    };
  }
  return {
    agentType: 'beat',
    patternName: pattern.name,
    stepCount: pattern.stepCount,
    tracks: summary,
    updatedAt: new Date().toISOString(),
  };
}
