import React from 'react';
import { AgentSidePanel } from './AgentSidePanel.jsx';
import { PrimitiveInspectorPanel } from './PrimitiveInspectorPanel.jsx';
import { WorkspaceTreePanel } from './WorkspaceTreePanel.jsx';

/**
 * Right column: workspace tree, agent panel, primitive inspector (top to bottom).
 */
export function RightDock({
  workspaceTreeOpen,
  workspaceTreeProps,
  onCloseWorkspaceTree,
  agentPanelOpen,
  onCloseAgentPanel,
  agentProps,
  inspectorOpen,
  inspectorProps,
  dockPinned,
  onCloseDock,
}) {
  if (!workspaceTreeOpen && !agentPanelOpen && !inspectorOpen) return null;

  const showBackdrop = !dockPinned;
  const stackedPanels =
    [workspaceTreeOpen, agentPanelOpen, inspectorOpen].filter(Boolean).length > 1;

  let agentClassName = 'flex-1 min-h-0';
  if (agentPanelOpen) {
    if (workspaceTreeOpen && inspectorOpen) {
      agentClassName = 'shrink-0 max-h-[30vh] min-h-[10rem]';
    } else if (workspaceTreeOpen) {
      agentClassName = 'flex-1 min-h-[10rem]';
    } else if (inspectorOpen) {
      agentClassName = 'shrink-0 max-h-[50vh] min-h-[12rem]';
    }
  }

  const treeClassName =
    stackedPanels && (agentPanelOpen || inspectorOpen)
      ? 'shrink-0 max-h-[45vh] min-h-[8rem]'
      : 'flex-1 min-h-0';

  return (
    <div className="fixed left-0 right-0 bottom-0 top-[var(--canvas-header-height)] z-40 flex justify-end pointer-events-none">
      {showBackdrop && (
        <button
          type="button"
          className="absolute inset-0 bg-black/20 pointer-events-auto"
          aria-label="Close panel"
          onClick={onCloseDock}
        />
      )}
      <div className="right-dock h-full w-full max-w-md flex flex-col pointer-events-auto bg-surface border-l border-border shadow-2xl">
        {workspaceTreeOpen && (
          <WorkspaceTreePanel
            className={treeClassName}
            onClose={onCloseWorkspaceTree}
            {...workspaceTreeProps}
          />
        )}
        {workspaceTreeOpen && agentPanelOpen && (
          <div className="border-t border-border shrink-0" aria-hidden />
        )}
        {agentPanelOpen && (
          <AgentSidePanel
            className={agentClassName}
            onClose={onCloseAgentPanel}
            {...agentProps}
          />
        )}
        {agentPanelOpen && inspectorOpen && (
          <div className="border-t border-border shrink-0" aria-hidden />
        )}
        {workspaceTreeOpen && !agentPanelOpen && inspectorOpen && (
          <div className="border-t border-border shrink-0" aria-hidden />
        )}
        {inspectorOpen && (
          <div className="flex-1 min-h-[12rem] flex flex-col min-h-0">
            <PrimitiveInspectorPanel variant="embedded" {...inspectorProps} />
          </div>
        )}
      </div>
    </div>
  );
}
