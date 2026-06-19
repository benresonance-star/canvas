import React from 'react';
import { strings } from '../../../content/strings.js';
import { getPinnedVersion } from '../../../lib/agentContextContent.js';
import { CardPreview } from '../../../components/CardPreview.jsx';
import { NotePreviewFrame } from '../../../components/NotePreviewFrame.jsx';
import { useFlowEditorContext } from './FlowEditorContext.jsx';
import { useFlowAgentChatPreviewContext } from '../hooks/useFlowAgentChatPreviewContext.js';

function ArtifactFlowNodePreview({ data }) {
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
    <div className="h-full w-full min-h-0 overflow-auto">
      <CardPreview
        card={card}
        pinned={pinned}
        isActive={false}
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

function LocalFlowNodePreview({ data }) {
  if (!data.description?.trim()) {
    return (
      <div className="h-full flex items-center justify-center px-3 text-center">
        <p className="sans text-xs text-muted italic">{strings.flow.localPreviewEmpty}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 overflow-auto">
      <NotePreviewFrame
        content={data.description}
        contentKey={`flow-local-${data.title ?? 'node'}`}
        isActive={false}
      />
    </div>
  );
}

export function FlowNodePreview({ nodeType, data }) {
  if (nodeType === 'artifact') {
    return <ArtifactFlowNodePreview data={data} />;
  }
  return <LocalFlowNodePreview data={data} />;
}
