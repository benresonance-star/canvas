import { createContext, useContext } from 'react';

/** @type {React.Context<{ isDraggingEdgeLabelRef: React.MutableRefObject<boolean>, setFlowEdges: (updater: (edges: object[]) => object[]) => void } | null>} */
export const DiagnosticsFlowInteractionContext = createContext(null);

export function useDiagnosticsFlowInteraction() {
  return useContext(DiagnosticsFlowInteractionContext);
}
