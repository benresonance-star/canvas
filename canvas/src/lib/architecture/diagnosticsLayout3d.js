/* eslint-disable no-fallthrough */
import {
  LAYER_ORDER,
  LAYER_Y,
  LAYER_LABELS,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_GAP_X,
  LAYER_GROUP_PADDING,
  LAYER_ORIGIN_X,
} from './architectureLayoutConstants.js';

import { computeArchitectureNodeLayouts } from './architectureEdgeRouting.js';



export const FLOW_TO_WORLD_SCALE = 0.012;

/** @deprecated Layer stacking uses flow Y bands; kept for imports. */

export const LAYER_Z_SPACING = 8;

export const NODE_WORLD_WIDTH = NODE_WIDTH * FLOW_TO_WORLD_SCALE;

export const NODE_WORLD_HEIGHT = NODE_HEIGHT * FLOW_TO_WORLD_SCALE;

export const NODE_FLOAT_Y = 0.04;

export const DIAGRAM_ORIGIN_X = LAYER_ORIGIN_X;



const LAYER_BAND_FALLBACK_HEIGHT = 220;

export const LAYER_TITLE_FLOW_INSET_X = 8;
export const LAYER_TITLE_FLOW_INSET_Y = 8;

/**
 * @param {import('./architectureGraphSchema.js').ArchitectureNodeDef[]} graphNodes
 */
function groupNodesByLayer(graphNodes) {
  const byLayer = new Map();
  for (const layer of LAYER_ORDER) byLayer.set(layer, []);
  for (const node of graphNodes) {
    byLayer.get(node.layer)?.push(node);
  }
  return byLayer;
}

/**
 * @param {number} nodeCount
 */
export function computeLayerFlowShelfExtent(nodeCount) {
  if (nodeCount <= 0) return null;
  const rowWidth = nodeCount * NODE_WIDTH + (nodeCount - 1) * NODE_GAP_X;
  const flowWidth = rowWidth + LAYER_GROUP_PADDING * 2;
  return {
    flowLeft: LAYER_ORIGIN_X,
    flowRight: LAYER_ORIGIN_X + flowWidth,
    flowWidth,
  };
}

/**

 * @param {import('./architectureGraphSchema.js').ArchitectureNodeDef[]} graphNodes

 */

export function buildDiagnosticsLayout3d(graphNodes) {

  const layouts = computeArchitectureNodeLayouts(graphNodes);

  const layoutList = [...layouts.values()];

  const centerX = layoutList.length

    ? layoutList.reduce((sum, layout) => sum + layout.centerX, 0) / layoutList.length

    : 0;

  const centerY = layoutList.length

    ? layoutList.reduce((sum, layout) => sum + layout.centerY, 0) / layoutList.length

    : 0;



  /** @type {Map<string, { flow: object, world: object }>} */

  const byNodeId = new Map();



  for (const [nodeId, layout] of layouts) {

    byNodeId.set(nodeId, {

      flow: layout,

      world: flowLayoutToWorld(layout, centerX, centerY),

    });

  }



  const byLayer = groupNodesByLayer(graphNodes);

  const layerPlanes = LAYER_ORDER.flatMap((layer, layerIndex) => {
    const shelfExtent = computeLayerFlowShelfExtent((byLayer.get(layer) ?? []).length);
    if (!shelfExtent) return [];

    const flowYStart = LAYER_Y[layer];
    const nextLayer = LAYER_ORDER[layerIndex + 1];
    const flowYEnd = nextLayer ? LAYER_Y[nextLayer] : flowYStart + LAYER_BAND_FALLBACK_HEIGHT;
    const worldZ = ((flowYStart + flowYEnd) / 2 - centerY) * FLOW_TO_WORLD_SCALE;
    const worldDepth = (flowYEnd - flowYStart) * FLOW_TO_WORLD_SCALE;
    const flowCenterX = (shelfExtent.flowLeft + shelfExtent.flowRight) / 2;
    const worldCenterX = (flowCenterX - centerX) * FLOW_TO_WORLD_SCALE;
    const worldWidth = shelfExtent.flowWidth * FLOW_TO_WORLD_SCALE;
    const titleFlowX = shelfExtent.flowLeft + LAYER_TITLE_FLOW_INSET_X;
    const titleFlowY = flowYStart + LAYER_TITLE_FLOW_INSET_Y;
    const titleWorld = {
      ...flowPointToWorld(titleFlowX, titleFlowY, layerIndex, centerX, centerY),
      y: NODE_FLOAT_Y + 0.025,
    };

    return [{
      layer,
      layerIndex,
      label: LAYER_LABELS[layer],
      flowY: flowYStart,
      flowYEnd,
      worldZ,
      worldDepth,
      worldCenterX,
      worldWidth,
      titleWorld,
    }];
  });



  return {

    layouts,

    layoutList,

    centerX,

    centerY,

    byNodeId,

    layerPlanes,

  };

}



/**

 * Map the 2D flow layout onto a flat XZ plane so the 3D view mirrors the 2D canvas.

 *

 * @param {{ centerX: number, centerY: number, layerIndex: number }} layout

 * @param {number} [originCenterX]

 * @param {number} [originCenterY]

 */

export function flowLayoutToWorld(layout, originCenterX = 0, originCenterY = 0) {

  return {

    x: (layout.centerX - originCenterX) * FLOW_TO_WORLD_SCALE,

    y: NODE_FLOAT_Y,

    z: (layout.centerY - originCenterY) * FLOW_TO_WORLD_SCALE,

    layerIndex: layout.layerIndex,

  };

}



/**

 * @param {number} flowX

 * @param {number} flowY

 * @param {number} [_layerIndex]

 * @param {number} [originCenterX]

 * @param {number} [originCenterY]

 */

export function flowPointToWorld(flowX, flowY, _layerIndex, originCenterX = 0, originCenterY = 0) {

  return {

    x: (flowX - originCenterX) * FLOW_TO_WORLD_SCALE,

    y: NODE_FLOAT_Y + 0.01,

    z: (flowY - originCenterY) * FLOW_TO_WORLD_SCALE,

  };

}



/**

 * @param {{ x: number, y: number, z: number }} world

 * @param {number} [_layerIndex]

 * @param {number} [originCenterX]

 * @param {number} [originCenterY]

 */

export function worldPointToFlow(world, _layerIndex, originCenterX = 0, originCenterY = 0) {

  return {

    x: world.x / FLOW_TO_WORLD_SCALE + originCenterX,

    y: world.z / FLOW_TO_WORLD_SCALE + originCenterY,

  };

}



/**

 * @param {{ x: number, y: number, centerX: number, centerY: number }} layout

 * @param {string} handleId

 */

export function getHandleFlowPosition(layout, handleId) {

  const { x, y, centerX, centerY } = layout;

  switch (handleId) {

    case 'top':

    case 'top-source':

      return { x: centerX, y };

    case 'bottom':

    case 'bottom-target':

      return { x: centerX, y: y + NODE_HEIGHT };

    case 'left':

    case 'left-source':

      return { x, y: centerY };

    case 'right':

    case 'right-target':

      return { x: x + NODE_WIDTH, y: centerY };

    default:

      return { x: centerX, y: y + NODE_HEIGHT };

  }

}



/**

 * @param {number} sourceLayerIndex

 * @param {number} targetLayerIndex

 * @param {number} t 0..1

 */

export function interpolateLayerIndex(sourceLayerIndex, targetLayerIndex, t) {

  return sourceLayerIndex + (targetLayerIndex - sourceLayerIndex) * t;

}


