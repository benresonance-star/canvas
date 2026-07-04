import {
  hashSonicSourceState,
  renderSonicVoiceSample,
} from '../../../packages/sonic-core/src/index.js';
import {
  createDefaultSonicStudioState,
  updateSonicVoice,
} from './domain/sonicStudioCard.js';
import { renderSonicStudioVoicePreview } from './domain/sonicStudioAudition.js';

/**
 * Stable Canvas ↔ sonic-core contract (see Specs/sonic_studio_spec.md §2).
 * Engine-first API for voice render, preview, and state hashing.
 */
export function createSonicEngine(engineState = {}) {
  let state = createDefaultSonicStudioState(engineState);

  const findVoice = (voiceId) => state.voices.find((voice) => voice.id === voiceId) ?? null;

  return {
    getState: () => state,
    setState(nextState = {}) {
      state = createDefaultSonicStudioState(nextState);
      return state;
    },
    createVoice(archetype = 'snare') {
      const voice = state.voices.find((entry) => entry.archetype === archetype) ?? state.voices[0];
      return voice?.id ?? null;
    },
    updateVoiceParams(voiceId, patch = {}) {
      if (!voiceId) return state;
      state = updateSonicVoice(state, voiceId, patch);
      return state;
    },
    renderVoice(voiceId, options = {}) {
      const voice = findVoice(voiceId);
      return renderSonicVoiceSample(voice, options);
    },
    previewVoice(voiceId, options = {}) {
      const voice = findVoice(voiceId);
      return renderSonicStudioVoicePreview({
        voice,
        engineState: state,
        ...options,
      });
    },
    hashState() {
      return hashSonicSourceState(state);
    },
    hashVoice(voiceId) {
      const voice = findVoice(voiceId);
      return voice ? hashSonicSourceState({ voices: [voice] }) : null;
    },
  };
}
