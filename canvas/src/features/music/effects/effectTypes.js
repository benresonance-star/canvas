export function createEffectState({ id, type, enabled = false, parameters = {}, uiState = {} }) {
  return { id, type, enabled, parameters, uiState };
}

export class MusicEffectRegistry {
  constructor() {
    this.effects = new Map();
  }

  register(effect) {
    if (!effect?.type) throw new Error('effect type is required');
    this.effects.set(effect.type, effect);
    return effect;
  }

  list() {
    return [...this.effects.values()];
  }
}
