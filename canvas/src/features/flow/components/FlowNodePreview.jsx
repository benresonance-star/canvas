import React from 'react';
import { strings } from '../../../content/strings.js';
import { getPinnedVersion } from '../../../lib/agentContextContent.js';
import { CardPreview } from '../../../components/CardPreview.jsx';
import { EditableMarkdownMessage } from '../../../components/EditableMarkdownMessage.jsx';
import { NotePreviewFrame } from '../../../components/NotePreviewFrame.jsx';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { useFlowAgentChatPreviewContext } from '../hooks/useFlowAgentChatPreviewContext.js';

function flowPreviewScrollClass(selected) {
  return [
    'h-full w-full min-h-0 overflow-auto px-4 pb-2',
    selected ? 'nowheel nodrag' : '',
  ].filter(Boolean).join(' ');
}

function localFlowPreviewScrollClass(selected) {
  return [
    'h-full w-full min-h-0 overflow-auto px-2 pt-1 pb-1',
    selected ? 'nowheel nodrag' : '',
  ].filter(Boolean).join(' ');
}

function stopBubble(event) {
  event.stopPropagation();
}

function ArtifactFlowNodePreview({ data, selected }) {
  const { cardsById, folderHandle, onRehydratePreview, projectId } = useFlowEditorContext();
  const card = cardsById.get(data.cardId);
  const pinned = card ? getPinnedVersion(card) : null;
  const agentChatCtx = useFlowAgentChatPreviewContext(card, projectId);

  if (!card) {
    return (
      <div className="h-full flex items-center justify-center px-3 text-center">
        <p className="sans text-xs text-muted">{strings.flow.previewUnavailable}</p>
      </div>
    );
  }

  return (
    <div className={flowPreviewScrollClass(selected)}>
      <CardPreview
        card={card}
        pinned={pinned}
        isActive={selected}
        compact={false}
        folderHandle={folderHandle}
        onRehydratePreview={onRehydratePreview}
        userNoteDisabled
        bookmarkEditDisabled
        agentChatThreadIndex={agentChatCtx.index}
        agentChatConnectorId={agentChatCtx.connectorId}
      />
    </div>
  );
}

function LocalFlowNodePreview({ nodeId, data, selected }) {
  const { updateNode, checkpoint, readOnly } = useFlowEditorContext();
  const canEditInline = selected && !readOnly;
  const description = data.description ?? '';

  if (canEditInline) {
    return (
      <div
        className={localFlowPreviewScrollClass(selected)}
        onPointerDown={stopBubble}
        onClick={stopBubble}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            checkpoint();
          }
        }}
      >
        <EditableMarkdownMessage
          value={description}
          onChange={(next) => updateNode(nodeId, { data: { description: next } })}
          compact
          className="text-sm text-secondary leading-relaxed min-h-[3rem]"
        />
      </div>
    );
  }

  if (!description.trim()) {
    return (
      <div className="h-full flex items-center justify-center px-3 text-center">
        <p className="sans text-xs text-muted italic">{strings.flow.localPreviewEmpty}</p>
      </div>
    );
  }

  return (
    <div className={localFlowPreviewScrollClass(selected)}>
      <NotePreviewFrame
        content={description}
        contentKey={`flow-local-${data.title ?? 'node'}`}
        isActive={selected}
        compact
      />
    </div>
  );
}

export function FlowNodePreview({ nodeId, nodeType, data, selected = false }) {
  if (nodeType === 'artifact') {
    return <ArtifactFlowNodePreview data={data} selected={selected} />;
  }
  return <LocalFlowNodePreview nodeId={nodeId} data={data} selected={selected} />;
}
