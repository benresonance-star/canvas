import { createDefaultTransportState } from '../../../../../packages/music-core/src/index.js';

export class ProjectClock {
  constructor(initialState = {}) {
    this.state = createDefaultTransportState(initialState);
  }

  update(patch = {}) {
    this.state = createDefaultTransportState({ ...this.state, ...patch });
    return this.state;
  }
}
