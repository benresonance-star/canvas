import React from 'react';
import { strings } from '../../../content/strings.js';
import { getPinnedVersion } from '../../../lib/agentContextContent.js';
import { CardPreview } from '../../../components/CardPreview.jsx';
import { NotePreviewFrame } from '../../../components/NotePreviewFrame.jsx';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { useFlowAgentChatPreviewContext } from '../hooks/useFlowAgentChatPreviewContext.js';

function flowPreviewScrollClass(selected) {
  return [
    'h-full w-full min-h-0 overflow-auto px-4 pb-2',
    selected ? 'nowheel nodrag' : '',
  ].filter(Boolean).join(' ');
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

function LocalFlowNodePreview({ data, selected }) {
  if (!data.description?.trim()) {
    return (
      <div className="h-full flex items-center justify-center px-3 text-center">
        <p className="sans text-xs text-muted italic">{strings.flow.localPreviewEmpty}</p>
      </div>
    );
  }

  return (
    <div className={flowPreviewScrollClass(selected)}>
      <NotePreviewFrame
        content={data.description}
        contentKey={`flow-local-${data.title ?? 'node'}`}
        isActive={selected}
      />
    </div>
  );
}

export function FlowNodePreview({ nodeType, data, selected = false }) {
  if (nodeType === 'artifact') {
    return <ArtifactFlowNodePreview data={data} selected={selected} />;
  }
  return <LocalFlowNodePreview data={data} selected={selected} />;
}
