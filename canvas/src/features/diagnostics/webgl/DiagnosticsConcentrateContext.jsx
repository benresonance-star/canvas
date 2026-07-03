import React, { createContext, useContext } from 'react';

/** @type {React.Context<{
 *   layout3d: object | null,
 *   progress: number,
 *   concentrateActive: boolean,
 *   visibleNodeIds: Set<string>,
 *   visibleEdgeIds: Set<string>,
 *   sceneBounds: { center: import('three').Vector3, radius: number } | null,
 *   layoutRuntimeRef: React.MutableRefObject<{
 *     animating: boolean,
 *     progress: number,
 *     layout3d: object | null,
 *   }>,
 * }>} */
export const DiagnosticsConcentrateContext = createContext({
  layout3d: null,
  progress: 0,
  concentrateActive: false,
  visibleNodeIds: new Set(),
  visibleEdgeIds: new Set(),
  sceneBounds: null,
  layoutRuntimeRef: { current: { animating: false, progress: 0, layout3d: null } },
});

export function useDiagnosticsConcentrate() {
  return useContext(DiagnosticsConcentrateContext);
}
