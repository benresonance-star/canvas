import { clamp } from '../dsp/sanitizeSample.js';
import { createSonicVoiceState } from '../types/models.js';

export function projectVoiceToSonicSpace(voice) {
  const state = createSonicVoiceState(voice);
  const brightness = state.material.brightness * 0.45 + state.contact.hardness * 0.35 + state.body.stiffness * 0.2;
  const resonance = state.body.resonance * 0.5 + (1 - state.material.damping) * 0.3 + state.body.modeDensity * 0.2;
  return {
    x: clamp(brightness * 2 - 1, -1, 1),
    y: clamp(resonance * 2 - 1, -1, 1),
  };
}

export function createSonicSavePoint({ id, name = 'Save Point', voice, tags = [], color, notes, parentId } = {}) {
  const fullState = createSonicVoiceState(voice);
  const position = projectVoiceToSonicSpace(fullState);
  const now = new Date().toISOString();
  return {
    id: id ?? `save-${Date.now()}`,
    name,
    x: position.x,
    y: position.y,
    fullState,
    tags,
    ...(color ? { color } : {}),
    ...(notes ? { notes } : {}),
    createdAt: now,
    updatedAt: now,
    ...(parentId ? { parentId } : {}),
  };
}

export function interpolateSonicVoice(a, b, amount = 0.5) {
  return interpolateValue(createSonicVoiceState(a), createSonicVoiceState(b), clamp(amount));
}

function interpolateValue(a, b, amount) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * amount;
  if (Array.isArray(a) || Array.isArray(b)) return amount < 0.5 ? a : b;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const output = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      output[key] = interpolateValue(a[key], b[key], amount);
    }
    return output;
  }
  return amount < 0.5 ? a : b;
}
