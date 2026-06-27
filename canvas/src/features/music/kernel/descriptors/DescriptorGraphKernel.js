import {
  createDefaultDescriptorGraph,
  updateDescriptorValue,
} from '../../../../../packages/music-core/src/index.js';

export class DescriptorGraphKernel {
  constructor(initialGraph = {}) {
    this.graph = createDefaultDescriptorGraph(initialGraph);
  }

  updateValue(name, value) {
    const result = updateDescriptorValue(this.graph, name, value);
    if (result.ok) this.graph = result.graph;
    return result;
  }

  snapshot() {
    return createDefaultDescriptorGraph(this.graph);
  }
}
