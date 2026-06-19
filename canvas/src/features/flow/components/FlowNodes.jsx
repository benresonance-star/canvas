import React, { useCallback } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { Eye, EyeOff, FileText, Workflow } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  CARD_RESIZE_MAX_H,
  CARD_RESIZE_MAX_W,
  CARD_RESIZE_MIN_H,
  CARD_RESIZE_MIN_W,
} from '../../../lib/constants.js';
import { defaultFlowNodePreviewSize, flowArtifactNodeDisplayTitle } from '../domain/flowDocument.js';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { FlowNodePreview } from './FlowNodePreview.jsx';

function NodeShell({ children, accent = false, agentScoped = false, expanded = false }) {
  const highlighted = accent || agentScoped;
  return (
    <div
      className={`rounded-xl border-2 bg-surface shadow-lg flex flex-col min-h-0 w-full ${
        expanded ? 'h-full' : 'min-w-44 max-w-64'
      } ${highlighted && !expanded ? 'border-accent' : 'border-border'}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-surface !bg-accent" />
      {children}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-surface !bg-accent" />
    </div>
  );
}

function ContentToggleButton({ showContent, onToggle }) {
  return (
    <button
      type="button"
      aria-label={showContent ? strings.flow.hideContent : strings.flow.showContent}
      title={showContent ? strings.flow.hideContent : strings.flow.showContent}
      className="shrink-0 p-1 text-muted hover:text-accent rounded"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {showContent ? <EyeOff size={13} /> : <Eye size={13} />}
    </button>
  );
}

function useShowContentToggle(nodeId, nodeType, data, card) {
  const { updateNode, checkpoint } = useFlowEditorContext();

  return useCallback(() => {
    const showing = data.showContent === true;
    if (showing) {
      updateNode(nodeId, { data: { showContent: false } }, { checkpoint: true });
      return;
    }
    const size = defaultFlowNodePreviewSize({ type: nodeType, data }, card ?? null);
    updateNode(
      nodeId,
      {
        data: { showContent: true },
        width: size.width,
        height: size.height,
      },
      { checkpoint: true },
    );
  }, [card, data, nodeId, nodeType, updateNode, checkpoint]);
}

function ExpandedNodeBody({ nodeType, data, selected }) {
  const { checkpoint } = useFlowEditorContext();
  const showContent = data.showContent === true;

  if (!showContent) return null;

  return (
    <>
      <div className="flex-1 min-h-0 border-t border-border overflow-hidden">
        <FlowNodePreview nodeType={nodeType} data={data} />
      </div>
      {selected && (
        <NodeResizer
          minWidth={CARD_RESIZE_MIN_W}
          minHeight={CARD_RESIZE_MIN_H}
          maxWidth={CARD_RESIZE_MAX_W}
          maxHeight={CARD_RESIZE_MAX_H}
          isVisible={selected}
          onResizeEnd={() => checkpoint()}
        />
      )}
    </>
  );
}

export function ArtifactFlowNode({ id, data, selected }) {
  const { cardsById, agentScopedNodeIds } = useFlowEditorContext();
  const card = cardsById.get(data.cardId);
  const showContent = data.showContent === true;
  const onToggle = useShowContentToggle(id, 'artifact', data, card);
  const displayTitle = flowArtifactNodeDisplayTitle(data, card);
  const agentScoped = Boolean(agentScopedNodeIds?.has(id));

  return (
    <NodeShell accent={selected} agentScoped={agentScoped} expanded={showContent}>
      <div className="flex items-start gap-2 px-3 py-3 shrink-0">
        <FileText size={14} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="serif text-sm text-primary truncate" title={displayTitle}>{displayTitle}</div>
          <div className="sans text-[9px] uppercase tracking-wider text-muted mt-1">Live artifact reference</div>
        </div>
        <ContentToggleButton showContent={showContent} onToggle={onToggle} />
      </div>
      <ExpandedNodeBody nodeType="artifact" data={data} selected={selected} />
    </NodeShell>
  );
}

export function LocalFlowNode({ id, data, selected }) {
  const { agentScopedNodeIds } = useFlowEditorContext();
  const showContent = data.showContent === true;
  const onToggle = useShowContentToggle(id, 'local', data, null);
  const agentScoped = Boolean(agentScopedNodeIds?.has(id));

  return (
    <NodeShell accent={selected} agentScoped={agentScoped} expanded={showContent}>
      <div className="flex items-start gap-2 px-3 py-3 shrink-0">
        <Workflow size={14} className="mt-0.5 shrink-0 text-secondary" />
        <div className="min-w-0 flex-1">
          <div className="serif text-sm text-primary break-words">{data.title || 'Untitled node'}</div>
          {!showContent && data.description && (
            <div className="sans text-[10px] text-secondary mt-1 max-w-52 break-words">{data.description}</div>
          )}
        </div>
        <ContentToggleButton showContent={showContent} onToggle={onToggle} />
      </div>
      <ExpandedNodeBody nodeType="local" data={data} selected={selected} />
    </NodeShell>
  );
}
