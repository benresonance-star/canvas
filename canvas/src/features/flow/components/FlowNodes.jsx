import React, { useCallback } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { Eye, EyeOff, FileText } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  CARD_RESIZE_MAX_H,
  CARD_RESIZE_MAX_W,
  CARD_RESIZE_MIN_H,
  CARD_RESIZE_MIN_W,
} from '../../../lib/constants.js';
import { defaultFlowNodePreviewSize, flowArtifactNodeDisplayTitle } from '../domain/flowDocument.js';
import { flowLocalNodeHeaderUsesDarkText, resolveFlowLocalNodeTypeColor } from '../domain/flowLocalNodeTypeColors.js';
import { flowLocalNodeTypeMeta } from '../domain/flowLocalNodeTypes.js';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { FlowNodeActorIcons } from './FlowNodeActorIcons.jsx';
import { FlowNodePreview } from './FlowNodePreview.jsx';

function stopBubble(event) {
  event.stopPropagation();
}

function NodeShell({ children, accent = false, agentScoped = false, expanded = false }) {
  const highlighted = accent || agentScoped;
  return (
    <div
      className={`rounded-xl border-2 bg-surface shadow-lg flex flex-col min-h-0 w-full overflow-hidden ${
        expanded ? 'h-full' : 'min-w-44 max-w-64'
      } ${highlighted && !expanded ? 'border-accent' : 'border-border'}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-surface !bg-accent" />
      {children}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-surface !bg-accent" />
    </div>
  );
}

function headerTextClass(headerColor) {
  return flowLocalNodeHeaderUsesDarkText(headerColor) ? 'text-primary' : 'text-white';
}

function headerMutedTextClass(headerColor) {
  return flowLocalNodeHeaderUsesDarkText(headerColor) ? 'text-muted' : 'text-white/75';
}

function ContentToggleButton({ showContent, onToggle, onColoredHeader = false, headerColor }) {
  const iconClass = onColoredHeader
    ? (flowLocalNodeHeaderUsesDarkText(headerColor) ? 'text-muted hover:text-primary' : 'text-white/80 hover:text-white')
    : 'text-muted hover:text-accent';

  return (
    <button
      type="button"
      aria-label={showContent ? strings.flow.hideContent : strings.flow.showContent}
      title={showContent ? strings.flow.hideContent : strings.flow.showContent}
      className={`shrink-0 p-1 rounded ${iconClass}`}
      onPointerDown={stopBubble}
      onClick={(event) => {
        stopBubble(event);
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

function ExpandedNodeBody({ nodeId, nodeType, data, selected }) {
  const { checkpoint } = useFlowEditorContext();
  const showContent = data.showContent === true;

  if (!showContent) return null;

  return (
    <>
      <div className="flex-1 min-h-0 border-t border-border overflow-hidden bg-surface">
        <FlowNodePreview nodeId={nodeId} nodeType={nodeType} data={data} selected={selected} />
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

function LocalFlowNodeTitle({ nodeId, data, selected, readOnly, headerColor }) {
  const { updateNode, checkpoint } = useFlowEditorContext();
  const title = data.title || 'Untitled node';
  const canEditInline = selected && !readOnly;
  const textClass = headerTextClass(headerColor);
  const darkHeaderText = flowLocalNodeHeaderUsesDarkText(headerColor);

  if (!canEditInline) {
    return (
      <div className={`serif text-sm break-words ${textClass}`}>{title}</div>
    );
  }

  return (
    <input
      type="text"
      value={data.title ?? ''}
      onChange={(event) => updateNode(nodeId, { data: { title: event.target.value } })}
      onBlur={() => checkpoint()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onPointerDown={stopBubble}
      onClick={stopBubble}
      className={`nodrag w-full min-w-0 serif text-sm bg-transparent border-0 border-b focus:outline-none px-0 py-0.5 ${textClass} ${
        darkHeaderText ? 'border-border-subtle focus:border-accent/50' : 'border-white/30 focus:border-white/70'
      }`}
      aria-label="Node name"
    />
  );
}

function ColoredNodeHeader({ headerColor, children }) {
  return (
    <div
      className="flex items-start gap-2 px-3 py-3 shrink-0 rounded-t-[10px]"
      style={{ backgroundColor: headerColor }}
    >
      {children}
    </div>
  );
}

export function ArtifactFlowNode({ id, data, selected }) {
  const { cardsById, agentScopedNodeIds, localNodeTypeColors } = useFlowEditorContext();
  const card = cardsById.get(data.cardId);
  const showContent = data.showContent === true;
  const onToggle = useShowContentToggle(id, 'artifact', data, card);
  const displayTitle = flowArtifactNodeDisplayTitle(data, card);
  const agentScoped = Boolean(agentScopedNodeIds?.has(id));
  const headerColor = resolveFlowLocalNodeTypeColor(localNodeTypeColors, 'artifact');
  const textClass = headerTextClass(headerColor);
  const mutedClass = headerMutedTextClass(headerColor);

  return (
    <NodeShell accent={selected} agentScoped={agentScoped} expanded={showContent}>
      <ColoredNodeHeader headerColor={headerColor}>
        <FileText size={14} className={`mt-0.5 shrink-0 ${textClass}`} />
        <div className="min-w-0 flex-1">
          <FlowNodeActorIcons actors={data.actors} headerColor={headerColor} />
          <div className={`serif text-sm truncate ${textClass}`} title={displayTitle}>{displayTitle}</div>
          <div className={`sans text-[9px] uppercase tracking-wider mt-1 ${mutedClass}`}>Live artifact reference</div>
        </div>
        <ContentToggleButton
          showContent={showContent}
          onToggle={onToggle}
          onColoredHeader
          headerColor={headerColor}
        />
      </ColoredNodeHeader>
      <ExpandedNodeBody nodeId={id} nodeType="artifact" data={data} selected={selected} />
    </NodeShell>
  );
}

export function LocalFlowNode({ id, data, selected }) {
  const { agentScopedNodeIds, readOnly, localNodeTypeColors } = useFlowEditorContext();
  const showContent = data.showContent === true;
  const onToggle = useShowContentToggle(id, 'local', data, null);
  const agentScoped = Boolean(agentScopedNodeIds?.has(id));
  const typeMeta = flowLocalNodeTypeMeta(data.localNodeType);
  const TypeIcon = typeMeta.icon;
  const headerColor = resolveFlowLocalNodeTypeColor(localNodeTypeColors, data.localNodeType);
  const textClass = headerTextClass(headerColor);

  return (
    <NodeShell accent={selected} agentScoped={agentScoped} expanded={showContent}>
      <ColoredNodeHeader headerColor={headerColor}>
        <TypeIcon size={14} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${textClass}`} />
        <div className="min-w-0 flex-1">
          <FlowNodeActorIcons actors={data.actors} headerColor={headerColor} />
          <LocalFlowNodeTitle
            nodeId={id}
            data={data}
            selected={selected}
            readOnly={readOnly}
            headerColor={headerColor}
          />
          {!showContent && data.description && (
            <div className={`sans text-[10px] mt-1 max-w-52 break-words ${headerMutedTextClass(headerColor)}`}>
              {data.description}
            </div>
          )}
        </div>
        <ContentToggleButton
          showContent={showContent}
          onToggle={onToggle}
          onColoredHeader
          headerColor={headerColor}
        />
      </ColoredNodeHeader>
      <ExpandedNodeBody nodeId={id} nodeType="local" data={data} selected={selected} />
    </NodeShell>
  );
}
