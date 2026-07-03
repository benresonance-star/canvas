import { createContext, useContext } from 'react';

/** @type {React.Context<{ diagramRadius: number, labelViewScale: number }>} */
export const DiagnosticsWebGLViewContext = createContext({
  diagramRadius: 12,
  labelViewScale: 12,
});

export function useDiagnosticsWebGLView() {
  return useContext(DiagnosticsWebGLViewContext);
}

/**
 * @param {number} distance
 * @param {number} labelViewScale typical fit-camera distance for the current diagram
 * @param {boolean} emphasis
 */
export function getNodeLabelOpacity(distance, labelViewScale, emphasis = false) {
  const revealDistance = labelViewScale * (emphasis ? 1.25 : 1.05);
  const fullDistance = labelViewScale * (emphasis ? 0.82 : 0.62);

  if (distance >= revealDistance) return 0;
  if (distance <= fullDistance) return 1;
  return 1 - (distance - fullDistance) / (revealDistance - fullDistance);
}

/**
 * Wire labels use tighter distance thresholds than node cards.
 *
 * @param {number} distance
 * @param {number} labelViewScale
 * @param {boolean} emphasis
 */
export function getEdgeLabelOpacity(distance, labelViewScale, emphasis = false) {
  const revealDistance = labelViewScale * (emphasis ? 0.95 : 0.78);
  const fullDistance = labelViewScale * (emphasis ? 0.58 : 0.42);

  if (distance >= revealDistance) return 0;
  if (distance <= fullDistance) return 1;
  return 1 - (distance - fullDistance) / (revealDistance - fullDistance);
}

/** Lift emphasized labels clear of thick Line2 wires on the XZ plane. */
export function getEdgeLabelYOffset(emphasis = false) {
  return emphasis ? 0.055 : 0.015;
}

/**
 * Thin highlighted wires when the camera is far — Line2 width is screen pixels.
 *
 * @param {number} distance
 * @param {number} diagramRadius
 * @param {number} baseWidth
 */
export function getEmphasizedEdgeLineWidth(distance, diagramRadius, baseWidth) {
  const nearDistance = diagramRadius * 0.32;
  const farDistance = diagramRadius * 2.4;
  const minScale = 0.35;
  const maxScale = 1;

  if (distance <= nearDistance) return baseWidth * maxScale;
  if (distance >= farDistance) return baseWidth * minScale;
  const t = (distance - nearDistance) / (farDistance - nearDistance);
  return baseWidth * (maxScale + (minScale - maxScale) * t);
}
