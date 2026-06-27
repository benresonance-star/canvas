import React, { useCallback, useLayoutEffect } from 'react';
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Eye, EyeOff } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  CARD_RESIZE_MAX_H,
  CARD_RESIZE_MAX_W,
  CARD_RESIZE_MIN_H,
  CARD_RESIZE_MIN_W,
} from '../../../lib/constants.js';
import { defaultFlowNodePreviewSize, flowArtifactNodeDisplayTitle, UNTITLED_FLOW_STEP_TITLE } from '../domain/flowDocument.js';
import { flowLocalNodeHeaderUsesDarkText, resolveFlowLocalNodeTypeColor } from '../domain/flowLocalNodeTypeColors.js';
import { flowLocalNodeTypeMeta } from '../domain/flowLocalNodeTypes.js';
import { flowNodeActorMetas } from '../domain/flowNodeActors.js';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { FlowNodeActorIcons } from './FlowNodeActorIcons.jsx';
import { FlowNodePreview } from './FlowNodePreview.jsx';
import { FlowStepRunStateGlyph } from './FlowStepRunStateMenu.jsx';

function stopBubble(event) {
  event.stopPropagation();
}

function useCollapsedNodeInternals(nodeId, showContent, syncKey) {
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    if (showContent) return;
    updateNodeInternals(nodeId);
  }, [nodeId, showContent, syncKey, updateNodeInternals]);
}

function NodeShell({ children, selected = false, agentScoped = false, expanded = false }) {
  let borderClass = 'border-2 border-border';
  if (selected) {
    borderClass = 'border-2 border-accent';
  } else if (agentScoped) {
    borderClass = 'border-2 border-accent/70';
  }

  return (
    <div
      className={`flow-node-shell rounded-xl bg-surface shadow-lg flex flex-col min-h-0 overflow-hidden ${
        expanded ? 'h-full w-full' : 'min-w-44 w-max'
      } ${borderClass}`}
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
  const title = data.title || UNTITLED_FLOW_STEP_TITLE;
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
      size={Math.max(12, (data.title ?? '').length || UNTITLED_FLOW_STEP_TITLE.length)}
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
      className={`nodrag serif text-sm bg-transparent border-0 border-b focus:outline-none px-0 py-0.5 ${textClass} ${
        darkHeaderText ? 'border-border-subtle focus:border-accent/50' : 'border-white/30 focus:border-white/70'
      }`}
      aria-label="Step name"
    />
  );
}

function FlowNodeTypeBadge({ typeMeta, headerColor }) {
  const TypeIcon = typeMeta.icon;
  const textClass = headerTextClass(headerColor);

  return (
    <span className={`inline-flex items-center gap-1 shrink-0 ${textClass}`}>
      <TypeIcon size={12} strokeWidth={1.5} aria-hidden />
      <span className="sans text-[9px] uppercase tracking-wider">{typeMeta.label}</span>
    </span>
  );
}

function StepRunStateBadge({ nodeId, headerColor }) {
  const { pathRunStateByStepId } = useFlowEditorContext();
  if (!pathRunStateByStepId?.has(nodeId)) return null;
  const textClass = headerTextClass(headerColor);
  return (
    <FlowStepRunStateGlyph
      stateId={pathRunStateByStepId.get(nodeId)}
      className={`w-4 text-sm leading-none ${textClass}`}
    />
  );
}

function NodeHeaderMetaRow({ typeMeta, actors, headerColor }) {
  const actorMetas = flowNodeActorMetas(actors);
  if (!typeMeta && !actorMetas.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
      {typeMeta ? <FlowNodeTypeBadge typeMeta={typeMeta} headerColor={headerColor} /> : null}
      {actorMetas.length > 0 ? (
        <FlowNodeActorIcons actors={actors} headerColor={headerColor} />
      ) : null}
    </div>
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
  const typeMeta = flowLocalNodeTypeMeta('artifact');
  const headerColor = resolveFlowLocalNodeTypeColor(localNodeTypeColors, 'artifact');
  const textClass = headerTextClass(headerColor);
  const mutedClass = headerMutedTextClass(headerColor);
  const internalsKey = `${displayTitle}:${JSON.stringify(data.actors ?? [])}:${showContent}`;

  useCollapsedNodeInternals(id, showContent, internalsKey);

  return (
    <NodeShell selected={selected} agentScoped={agentScoped} expanded={showContent}>
      <ColoredNodeHeader headerColor={headerColor}>
        <div className="flex-1">
          <NodeHeaderMetaRow typeMeta={typeMeta} actors={data.actors} headerColor={headerColor} />
          <div className={`flex items-start gap-1.5 serif text-sm ${textClass}`}>
            <StepRunStateBadge nodeId={id} headerColor={headerColor} />
            <span className="break-words" title={displayTitle}>{displayTitle}</span>
          </div>
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
  const headerColor = resolveFlowLocalNodeTypeColor(localNodeTypeColors, data.localNodeType);
  const internalsKey = `${data.title ?? ''}:${JSON.stringify(data.actors ?? [])}:${data.description ?? ''}:${showContent}`;

  useCollapsedNodeInternals(id, showContent, internalsKey);

  return (
    <NodeShell selected={selected} agentScoped={agentScoped} expanded={showContent}>
      <ColoredNodeHeader headerColor={headerColor}>
        <div className="flex-1">
          <NodeHeaderMetaRow typeMeta={typeMeta} actors={data.actors} headerColor={headerColor} />
          <div className="flex items-start gap-1.5">
            <StepRunStateBadge nodeId={id} headerColor={headerColor} />
            <div className="flex-1 min-w-0">
              <LocalFlowNodeTitle
                nodeId={id}
                data={data}
                selected={selected}
                readOnly={readOnly}
                headerColor={headerColor}
              />
            </div>
          </div>
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
