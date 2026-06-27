export class GrooveEngine {
  constructor(initialState = {}) {
    this.state = {
      swing: initialState.swing ?? 0,
      humanizeMs: initialState.humanizeMs ?? 0,
      velocitySpread: initialState.velocitySpread ?? 0,
    };
  }

  fromDescriptors(descriptorGraph) {
    const humanFeel = descriptorGraph?.descriptors?.['Human Feel']?.value ?? 0.5;
    const motion = descriptorGraph?.descriptors?.Motion?.value ?? 0.5;
    this.state = {
      swing: motion * 0.28,
      humanizeMs: humanFeel * 18,
      velocitySpread: humanFeel * 0.22,
    };
    return this.state;
  }
}
