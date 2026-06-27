export class HarmonyEngine {
  constructor(initialState = {}) {
    this.state = {
      key: initialState.key ?? 'C',
      mode: initialState.mode ?? 'minor',
      tension: initialState.tension ?? 0.5,
    };
  }

  fromDescriptors(descriptorGraph) {
    this.state = {
      ...this.state,
      tension: descriptorGraph?.descriptors?.Tension?.value ?? this.state.tension,
    };
    return this.state;
  }
}
