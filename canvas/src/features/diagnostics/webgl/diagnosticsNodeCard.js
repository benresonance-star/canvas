import * as THREE from 'three';
import {
  NODE_WORLD_HEIGHT,
  NODE_WORLD_WIDTH,
} from '../../../lib/architecture/diagnosticsLayout3d.js';
import { DIAGNOSTICS_LAYER_COLORS } from './diagnosticsNodeGlassMaterial.js';
import { getNodeHighlightStyle } from './diagnosticsNodeLabelTexture.js';

/** Visible slab depth on the XZ diagram plane (world Y). */
export const NODE_EXTRUDE_DEPTH = 0.048;

/** One shared corner radius for the card mesh. */
export const NODE_CARD_RADIUS = Math.min(
  NODE_WORLD_WIDTH * 0.025,
  NODE_EXTRUDE_DEPTH * 0.42,
  NODE_WORLD_HEIGHT * 0.12,
);

const SURFACE_FILL = new THREE.Color('#242428');

/**
 * @param {keyof typeof DIAGNOSTICS_LAYER_COLORS} layer
 * @param {'quiet' | 'path' | 'current'} role
 * @param {boolean} ghosted
 * @param {boolean} showCard
 */
export function resolveNodeCardVisual(layer, role, ghosted, showCard) {
  const highlight = getNodeHighlightStyle(layer, role);
  const layerColor = DIAGNOSTICS_LAYER_COLORS[layer] ?? DIAGNOSTICS_LAYER_COLORS.external;

  if (showCard) {
    return {
      fillColor: highlight.fillColor?.clone() ?? SURFACE_FILL,
      fillOpacity: ghosted ? 0.35 : (highlight.fillOpacity || 0.92),
    };
  }

  const markerColor = new THREE.Color(layerColor);
  let fillOpacity = 0.16;
  if (ghosted) fillOpacity = 0.08;
  else if (role === 'current') fillOpacity = 0.42;
  else if (role === 'path') fillOpacity = 0.28;

  return {
    fillColor: markerColor,
    fillOpacity,
  };
}
