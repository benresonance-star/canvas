import React, { useState, useCallback, useEffect } from 'react';
import { strings } from '../content/strings.js';
import { normalizeCardType, isTextMarkdownPreviewType } from '../lib/filename.js';
import { resolveThreadForCard } from '../lib/agentChatThreads.js';
import { useArtifactPayloadText } from '../hooks/useArtifactPayloadText.js';
import { NotePreviewFrame } from './NotePreviewFrame.jsx';
import { AgentChatThreadView } from './AgentChatThreadView.jsx';
import { useAgentChatCardMessages } from '../hooks/useAgentChatCardMessages.js';
import { UserNoteInlineEditor } from './UserNoteInlineEditor.jsx';
import { PdfPreviewFrame } from './PdfPreviewFrame.jsx';
import { SpreadsheetPreviewFrame } from './SpreadsheetPreviewFrame.jsx';
import { AudioPlayer } from './AudioPlayer.jsx';
import { BookmarkPreview } from './BookmarkPreview.jsx';
import { BookmarkInlineEditor } from './BookmarkInlineEditor.jsx';
import { audioSkinUsesDarkText, resolveAudioSkinColor } from '../lib/audioSkin.js';

export function CardPreview({
  card,
  pinned,
  isActive,
  compact = false,
  onRehydratePreview,
  onInlineSaveUserNote,
  onInlineSaveBookmark,
  userNoteSaving = false,
  bookmarkSaving = false,
  userNoteDisabled = false,
  bookmarkEditDisabled = false,
  showTapToEditHint = false,
  userNoteEditTitle,
  userNoteInitialTitle,
  agentChatLiveMessages = null,
  agentChatLiveCardId = null,
  agentChatTranscriptRevision = 0,
  agentChatThreadIndex = null,
  agentChatConnectorId = null,
  folderHandle = null,
}) {
  const [imgKey, setImgKey] = useState(0);

  const cardTypeEarly = normalizeCardType(card.type);
  const isAgentChat = cardTypeEarly === 'agent_chat';
  const threadMeta =
    isAgentChat && agentChatThreadIndex && agentChatConnectorId
      ? resolveThreadForCard(agentChatThreadIndex, card, agentChatConnectorId)
      : null;
  const artifactRefId =
    !isAgentChat && pinned?.artifactRef?.id ? pinned.artifactRef.id : null;
  const artifactPayload = useArtifactPayloadText(
    artifactRefId,
    Boolean(artifactRefId),
  );
  const agentChatCard = useAgentChatCardMessages({
    card,
    pinned,
    threadMeta,
    folderHandle,
    liveMessages: agentChatLiveMessages,
    liveCardId: agentChatLiveCardId,
    transcriptRevision: agentChatTranscriptRevision,
  });

  const handleImgError = useCallback(async () => {
    if (!pinned?.previewCacheKey || !onRehydratePreview) return;
    const ok = await onRehydratePreview(card.id, pinned.version, { force: true });
    if (ok) setImgKey((k) => k + 1);
  }, [card.id, pinned, onRehydratePreview]);

  if (!pinned) return <div className="serif italic text-muted text-sm">{strings.preview.noData}</div>;

  const localTranscript = pinned.content?.trim() || '';
  const mediaSrc = pinned.objectUrl || pinned.dataUrl || null;
  const msgClass = compact ? 'text-xs' : 'text-sm';
  const hintClass = compact ? 'text-[9px]' : 'text-[10px]';

  useEffect(() => {
    if (mediaSrc || !pinned.previewCacheKey || !onRehydratePreview) return;
    if (
      card.type !== 'image'
      && card.type !== 'pdf'
      && card.type !== 'video'
      && card.type !== 'audio'
      && card.type !== 'bookmark'
    ) return;
    onRehydratePreview(card.id, pinned.version);
  }, [card.id, card.type, pinned.version, pinned.previewCacheKey, mediaSrc, onRehydratePreview]);

  const cardType = normalizeCardType(card.type);
  if (cardType === 'bookmark') {
    if (isActive && onInlineSaveBookmark && !compact) {
      return (
        <BookmarkInlineEditor
          card={card}
          pinned={pinned}
          saving={bookmarkSaving}
          disabled={bookmarkEditDisabled}
          onSave={onInlineSaveBookmark}
        />
      );
    }
    return (
      <div className="h-full w-full min-h-0 flex flex-col">
        <BookmarkPreview
          card={card}
          pinned={pinned}
          compact={compact}
        />
        {!isActive && !compact && !bookmarkEditDisabled && (
          <p className="sans text-[9px] text-muted text-center py-1 shrink-0 pointer-events-none">
            {strings.userNote.tapToEdit}
          </p>
        )}
      </div>
    );
  }
  if (cardType === 'user_note') {
    if (isActive && onInlineSaveUserNote && !compact) {
      return (
        <UserNoteInlineEditor
          content={pinned.content || ''}
          initialTitle={userNoteInitialTitle ?? card.name}
          title={userNoteEditTitle ?? card.name}
          disabled={userNoteDisabled}
          saving={userNoteSaving}
          onSave={onInlineSaveUserNote}
        />
      );
    }
    return (
      <div className="h-full w-full min-h-0 flex flex-col">
        <NotePreviewFrame
          content={pinned.content || ''}
          contentKey={`${card.id}-v${pinned.version}-${cardType}`}
          isActive={isActive}
        />
        {showTapToEditHint && !userNoteDisabled && (
          <p className="sans text-[9px] text-muted text-center py-1 shrink-0 pointer-events-none">
            {strings.userNote.tapToEdit}
          </p>
        )}
      </div>
    );
  }
  if (cardType === 'agent_chat') {
    if (agentChatCard.loading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-2">
          <div className={`serif text-secondary mb-1 ${msgClass}`}>
            {strings.preview.loadingTranscript}
          </div>
        </div>
      );
    }
    if (agentChatCard.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-2">
          <div className={`serif italic text-muted ${msgClass}`}>
            {strings.preview.transcriptUnavailable}
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full min-h-0 flex flex-col">
        <AgentChatThreadView
          messages={agentChatCard.messages}
          compact
          scrollOnUpdate={false}
          className="flex-1 h-full"
        />
      </div>
    );
  }

  if (isTextMarkdownPreviewType(card.type)) {
    const content = localTranscript || artifactPayload.text || '';
    return (
      <NotePreviewFrame
        content={content}
        contentKey={`${card.id}-v${pinned.version}-${cardType}`}
        isActive={isActive}
      />
    );
  }

  if (cardType === 'spreadsheet' && (mediaSrc || pinned.previewCacheKey)) {
    return (
      <SpreadsheetPreviewFrame
        card={card}
        pinned={pinned}
        isActive={isActive}
        onRehydratePreview={onRehydratePreview}
        compact={compact}
      />
    );
  }

  if ((card.type === 'image' || card.type === 'pdf') && !mediaSrc) {
    if (pinned.previewCacheKey) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-2">
          <div className={`serif text-secondary mb-1 ${msgClass}`}>{strings.preview.loadingPdf}</div>
        </div>
      );
    }
    if (pinned.previewStripped) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-2">
          <div className={`serif italic text-muted mb-1 ${msgClass}`}>{strings.preview.notInProject}</div>
          <div className={`sans text-muted ${hintClass}`}>{strings.preview.resyncHint}</div>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className={`serif italic text-muted mb-1 ${msgClass}`}>{strings.preview.tooLarge}</div>
        <div className={`sans text-muted ${hintClass}`}>{strings.preview.doubleClickOpen}</div>
      </div>
    );
  }

  if (card.type === 'image' && mediaSrc) {
    return (
      <div className="h-full flex items-center justify-center overflow-hidden">
        <img
          key={`${card.id}-v${pinned.version}-img-${imgKey}`}
          src={mediaSrc}
          alt={card.name}
          draggable={false}
          className={`max-h-full max-w-full object-contain select-none ${compact ? 'max-h-[85%]' : ''}`}
          onError={handleImgError}
        />
      </div>
    );
  }

  if (card.type === 'html' && pinned.content) {
    return (
      <div className="h-full overflow-hidden relative">
        <iframe
          key={`${card.id}-v${pinned.version}-html`}
          srcDoc={pinned.content}
          sandbox="allow-same-origin"
          className={`w-full h-full border-0 bg-preview-bg ${isActive ? '' : 'pointer-events-none'}`}
          title={card.name}
        />
      </div>
    );
  }

  if (card.type === 'pdf' && mediaSrc) {
    return (
      <PdfPreviewFrame
        mediaSrc={mediaSrc}
        iframeKey={`${card.id}-v${pinned.version}-pdf`}
        title={card.name}
        pointerEventsNone={!isActive}
      />
    );
  }

  if (card.type === 'video' && mediaSrc) {
    return (
      <video src={mediaSrc} controls={isActive} className="w-full h-full object-contain" />
    );
  }

  if (cardType === 'audio') {
    if (!mediaSrc) {
      if (pinned.previewCacheKey) {
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <div className={`serif text-secondary mb-1 ${msgClass}`}>{strings.preview.loadingPdf}</div>
          </div>
        );
      }
      if (pinned.previewStripped) {
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <div className={`serif italic text-muted mb-1 ${msgClass}`}>{strings.preview.notInProject}</div>
            <div className={`sans text-muted ${hintClass}`}>{strings.preview.resyncHint}</div>
          </div>
        );
      }
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-2">
          <div className={`serif italic text-muted mb-1 ${msgClass}`}>{strings.audio.noPreview}</div>
          <div className={`sans text-muted ${hintClass}`}>{strings.preview.doubleClickOpen}</div>
        </div>
      );
    }
    const meta = pinned.audioMeta || {};
    const skinColor = resolveAudioSkinColor(card);
    return (
      <div
        className="h-full flex flex-col justify-center px-2 py-1 rounded-sm"
        style={skinColor ? { backgroundColor: skinColor } : undefined}
      >
        <AudioPlayer
          src={mediaSrc}
          title={meta.title || card.name}
          artist={meta.artist}
          compact
          onLightBackground={skinColor ? audioSkinUsesDarkText(skinColor) : false}
        />
      </div>
    );
  }

  if (!pinned.inline) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className={`serif italic text-muted mb-1 ${msgClass}`}>{strings.preview.tooLarge}</div>
        <div className={`sans text-muted ${hintClass}`}>{strings.preview.doubleClickOpen}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-center">
      <div>
        <div className={`serif italic text-muted mb-1 ${msgClass}`}>{card.versions[0]?.ext?.toUpperCase()} file</div>
        <div className={`sans text-muted ${hintClass}`}>{strings.preview.doubleClickDownload}</div>
      </div>
    </div>
  );
}
