import React, { createContext, useContext } from 'react';

/** @type {React.Context<null | {
 *   cardsById: Map<string, object>,
 *   folderHandle: FileSystemDirectoryHandle | null,
 *   projectId: string | null,
 *   onRehydratePreview: ((cardId: string, version: number, opts?: object) => Promise<boolean>) | null,
 *   updateNode: (nodeId: string, patch: { data?: Record<string, unknown>, width?: number, height?: number }, options?: { checkpoint?: boolean }) => void,
 *   checkpoint: () => void,
 * }>} */
const FlowEditorContext = createContext(null);

export function FlowEditorProvider({ value, children }) {
  return <FlowEditorContext.Provider value={value}>{children}</FlowEditorContext.Provider>;
}

export function useFlowEditorContext() {
  const context = useContext(FlowEditorContext);
  if (!context) {
    throw new Error('useFlowEditorContext must be used within FlowEditorProvider');
  }
  return context;
}
