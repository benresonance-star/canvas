import { ARCHITECTURE_ACTIONS } from './architectureActions.js';
import { ARCHITECTURE_NODES, ARCHITECTURE_PIPES } from './architectureGraph.js';
import { ARCHITECTURE_ROUTE_MANIFEST } from './architectureRouteManifest.js';
import { LAYER_ORDER } from './architectureGraph.js';

export function getArchitectureGraphManifest() {
  const nodesByLayer = Object.fromEntries(LAYER_ORDER.map((l) => [l, 0]));
  for (const node of ARCHITECTURE_NODES) {
    nodesByLayer[node.layer] = (nodesByLayer[node.layer] ?? 0) + 1;
  }
  return {
    nodeCount: ARCHITECTURE_NODES.length,
    pipeCount: ARCHITECTURE_PIPES.length,
    actionCount: ARCHITECTURE_ACTIONS.length,
    routeCount: ARCHITECTURE_ROUTE_MANIFEST.length,
    nodesByLayer,
    actionIds: ARCHITECTURE_ACTIONS.map((a) => a.id),
  };
}

export function collectArchitectureCodeRefs() {
  const refs = new Set();
  for (const node of ARCHITECTURE_NODES) {
    if (node.codeRef) refs.add(node.codeRef);
  }
  for (const action of ARCHITECTURE_ACTIONS) {
    for (const step of action.steps) {
      if (step.codeRef) refs.add(step.codeRef);
    }
  }
  return [...refs];
}

export function getRouteManifestGraphNodeIds() {
  return ARCHITECTURE_ROUTE_MANIFEST.map((r) => r.graphNodeId);
}
