import { SafetyLimiter } from '../dsp/SafetyLimiter.js';
import { saturateSample } from '../dsp/saturation.js';
import { clamp, sanitizeSample } from '../dsp/sanitizeSample.js';
import { renderExciter } from '../excitation/exciters.js';
import { renderCombResonator, renderKarplusStrong } from '../resonators/combResonator.js';
import { createModalModes, renderModalResonator } from '../resonators/modalResonator.js';
import { createSonicVoiceState } from '../types/models.js';

export function deriveVoiceRootHz(voice) {
  const body = voice.body ?? {};
  const material = voice.material ?? {};
  const archetypeBase = {
    kick: 58,
    snare: 180,
    hat: 5200,
    cymbal: 900,
    pad: 220,
    drone: 110,
  }[voice.archetype] ?? 140;
  const sizeScale = 2 ** ((0.5 - clamp(body.size ?? 0.5)) * 1.4);
  const tensionScale = 0.7 + clamp(body.tension ?? 0.5) * 0.9;
  const stiffnessScale = 0.85 + clamp(body.stiffness ?? 0.5) * 0.4;
  const materialScale = 0.85 + clamp(material.hardness ?? 0.5) * 0.35;
  return clamp(archetypeBase * sizeScale * tensionScale * stiffnessScale * materialScale, 20, 12000);
}

export function renderSonicEvent({
  voice,
  event = {},
  sampleRate = 48000,
  durationSeconds = 1,
  seed = 1,
} = {}) {
  const state = createSonicVoiceState(voice);
  const velocity = clamp(event.velocity ?? state.gesture.velocity ?? 0.8, 0, 1.5);
  const exciter = renderExciter({
    type: state.exciter?.type ?? 'stick_transient',
    sampleRate,
    durationSeconds,
    seed: event.randomSeed ?? seed,
    velocity,
    contact: { ...state.contact, ...(event.contactOverride ?? {}) },
    material: state.material,
    gesture: { ...state.gesture, ...(event.gestureOverride ?? {}) },
  });
  const rootHz = event.pitchHz ?? deriveVoiceRootHz(state);
  const resonatorType = state.resonator?.type ?? 'modal';
  let rendered;
  if (resonatorType === 'comb') {
    rendered = renderCombResonator(exciter, {
      sampleRate,
      frequencyHz: rootHz,
      feedback: state.resonator?.feedback ?? 0.74,
      damping: state.material.damping,
      brightness: state.material.brightness,
    });
  } else if (resonatorType === 'karplus') {
    rendered = renderKarplusStrong({
      sampleRate,
      durationSeconds,
      frequencyHz: rootHz,
      seed: event.randomSeed ?? seed,
      damping: state.material.damping,
      brightness: state.material.brightness,
    });
  } else {
    rendered = renderModalResonator(exciter, {
      sampleRate,
      modes: createModalModes({
        rootHz,
        modeCount: state.resonator?.modeCount ?? 6,
        material: state.material,
        body: state.body,
        position: { ...state.position, ...(event.positionOverride ?? {}) },
      }),
      outputGain: state.resonator?.outputGain ?? 1,
    });
  }
  const gain = clamp(state.output?.gain ?? 0.9, 0, 2);
  const pan = clamp(state.output?.pan ?? 0, -1, 1);
  const limiter = new SafetyLimiter({ sampleRate });
  for (let index = 0; index < rendered[0].length; index += 1) {
    const saturation = clamp(state.richness?.saturation ?? state.material.nonlinearity ?? 0, 0, 1);
    const leftPan = pan <= 0 ? 1 : 1 - pan;
    const rightPan = pan >= 0 ? 1 : 1 + pan;
    rendered[0][index] = limiter.process(sanitizeSample(saturateSample(rendered[0][index] * gain * leftPan, {
      mode: saturation > 0.3 ? 'asymmetric' : 'soft',
      drive: 1 + saturation * 8,
    })));
    rendered[1][index] = limiter.process(sanitizeSample(saturateSample(rendered[1][index] * gain * rightPan, {
      mode: saturation > 0.3 ? 'asymmetric' : 'soft',
      drive: 1 + saturation * 8,
    })));
  }
  return {
    sampleRate,
    durationSeconds,
    voice: state,
    buffer: rendered,
  };
}
