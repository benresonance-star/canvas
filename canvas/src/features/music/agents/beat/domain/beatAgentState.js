import {
  createDefaultBeatPattern,
  validateBeatPattern,
  createDefaultBeatAudioRouting,
  createDefaultBeatMixSettings,
  createDefaultBeatSonicTemporalState,
} from '../../../../../../packages/music-core/src/index.js';
import { normalizeBeatPatternSynth } from './beatTrackSynth.js';
import { createDefaultPocketState } from './pocket/index.js';
import { createDefaultGlitchState } from './glitch/index.js';

export function createDefaultBeatAgentState(overrides = {}) {
  const {
    updatedAt,
    pattern: overridePattern,
    ...rest
  } = overrides ?? {};
  const pattern = normalizeBeatPatternSynth(overridePattern ?? createDefaultBeatPattern());
  return {
    schemaVersion: 1,
    agentType: 'beat',
    name: 'Beat Agent',
    status: 'draft',
    syncMode: 'project',
    clockSync: false,
    transport: null,
    sonicTemporal: createDefaultBeatSonicTemporalState(rest.sonicTemporal),
    audioRouting: createDefaultBeatAudioRouting(rest.audioRouting),
    mixSettings: createDefaultBeatMixSettings(rest.mixSettings),
    pocket: createDefaultPocketState(rest.pocket),
    glitch: createDefaultGlitchState(rest.glitch),
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
    ...rest,
    pattern,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

export function validateBeatAgentState(state) {
  if (!state || state.agentType !== 'beat') {
    return { ok: false, reason: 'Beat Agent state is required' };
  }
  const patternValidation = validateBeatPattern(state.pattern);
  if (!patternValidation.ok) return patternValidation;
  if (state.pocket && typeof state.pocket !== 'object') {
    return { ok: false, reason: 'pocket must be an object' };
  }
  if (state.glitch && typeof state.glitch !== 'object') {
    return { ok: false, reason: 'glitch must be an object' };
  }
  return { ok: true };
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
