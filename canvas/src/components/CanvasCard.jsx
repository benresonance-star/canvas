import React, { useEffect, useState } from 'react';
import { Box, Layers, Trash2, Link2 } from 'lucide-react';
import { getCardPixelSize } from '../lib/cards.js';
import { cardHeaderLabel } from '../lib/filename.js';
import { strings } from '../content/strings.js';
import { TypeIcon } from './TypeIcon.jsx';
import { CardPreview } from './CardPreview.jsx';
import { AudioSkinTrigger } from './AudioSkinPicker.jsx';
import { resolveAudioSkinColor } from '../lib/audioSkin.js';

export function CanvasCard({
  card,
  isActive,
  isMultiSelected = false,
  zoom,
  missingFromFolder,
  linkCount = 0,
  isLinkDropHighlight,
  canLinkFrom,
  onActivate,
  onOpen,
  onStartDrag,
  onStartLinkDrag,
  onStartResize,
  onPinVersion,
  onDeleteCard,
  versionStackOpen,
  toggleVersionStack,
  onRehydratePreview,
  onInspectArtifact,
  onInlineSaveUserNote,
  onInlineSaveBookmark,
  onUpdateCard,
  userNoteSaving,
  bookmarkSaving,
  userNoteDisabled,
  bookmarkEditDisabled,
  folderLinked,
  isBeingDragged = false,
  agentChatLiveMessages = null,
  agentChatLiveCardId = null,
  agentChatTranscriptRevision = 0,
  agentChatThreadIndex = null,
  agentChatConnectorId = null,
  folderHandle = null,
}) {
  const versions = card.versions ?? [];
  const pinned =
    versions.find((v) => v.version === card.pinnedVersion) || versions[0];
  const hasNewerDraft = versions.some((v) => v.version > card.pinnedVersion);
  const hasMultipleVersions = versions.length > 1;

  const { w: cw, h: ch } = getCardPixelSize(card);

  const showSimplified = zoom < 0.5;
  const showResizeHandles = isActive && !showSimplified;

  const canEditUserNoteTitle =
    card.type === 'user_note' && isActive && !showSimplified && !userNoteDisabled;
  const [editName, setEditName] = useState(card.name);

  useEffect(() => {
    setEditName(card.name);
  }, [card.id, card.name]);

  const stopBubble = (e) => {
    e.stopPropagation();
  };

  const handleTitleBlur = () => {
    if (!canEditUserNoteTitle || userNoteSaving || !onInlineSaveUserNote) return;
    const name = editName.trim();
    if (name === card.name) return;
    void onInlineSaveUserNote({
      body: pinned?.content ?? '',
      name,
    });
  };

  const cornerCursor = {
    nw: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    se: 'nwse-resize',
  };

  const missingRing = missingFromFolder ? 'ring-2 ring-danger-ring ring-offset-1 ring-offset-canvas' : '';
  const linkHighlight = isLinkDropHighlight ? 'ring-2 ring-accent ring-offset-1 ring-offset-canvas' : '';
  const multiSelectRing = isMultiSelected && !isActive
    ? 'ring-2 ring-accent/50 ring-offset-1 ring-offset-canvas'
    : '';
  const missingHeaderTint = missingFromFolder ? 'bg-danger-muted border-danger-border' : 'border-border';

  return (
    <div
      data-card-id={card.id}
      {...(isBeingDragged ? { 'data-dragging-card': '' } : {})}
      className={`absolute group select-none${isBeingDragged ? ' z-10' : ''}`}
      style={{
        left: card.x,
        top: card.y,
        width: cw,
        height: ch,
      }}
      onPointerDown={onStartDrag}
      onClick={(e) => { e.stopPropagation(); onActivate(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}
    >
      <div
        className={`canvas-card bg-surface rounded-lg overflow-hidden h-full flex flex-col transition-[box-shadow,opacity] ${missingRing} ${linkHighlight} ${multiSelectRing} ${isActive ? 'card-shadow-active' : 'card-shadow'}`}
      >
        <div
          className={`shrink-0 flex items-start justify-between gap-2 border-b ${missingHeaderTint} ${
            showSimplified ? 'px-2 pt-2 pb-1' : 'px-4 pt-3 pb-2'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className={`sans uppercase tracking-wider text-muted mb-0.5 flex items-center gap-1.5 ${showSimplified ? 'text-[9px]' : 'text-[10px]'}`}>
              <TypeIcon type={card.type} className="text-muted" />
              <span>{cardHeaderLabel(card)}</span>
              {linkCount > 0 && (
                <span className="ml-1 sans text-[9px] text-accent normal-case tracking-normal">
                  {strings.graph.linkBadge(linkCount)}
                </span>
              )}
            </div>
            {canEditUserNoteTitle ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                disabled={userNoteSaving}
                className={`w-full min-w-0 serif bg-transparent border-0 border-b border-border-subtle focus:border-accent/50 focus:outline-none px-0 py-0.5 ${
                  missingFromFolder ? 'text-danger' : 'text-primary'
                } ${showSimplified ? 'text-sm' : 'text-base'}`}
                aria-label={strings.userNote.name}
                title={strings.userNote.titleSaveHint}
                onMouseDown={stopBubble}
                onClick={stopBubble}
              />
            ) : (
              <div
                className={`serif truncate ${missingFromFolder ? 'text-danger' : 'text-primary'} ${showSimplified ? 'text-sm' : 'text-base'}`}
                title={card.name}
              >
                {card.name}
              </div>
            )}
          </div>
          {!showSimplified && (
            <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
              {card.type === 'audio' && onUpdateCard && (
                <AudioSkinTrigger
                  currentColor={resolveAudioSkinColor(card)}
                  onApply={(color) => onUpdateCard(card.id, { audioSkinColor: color })}
                  compact
                />
              )}
              {pinned?.artifactRef && onInspectArtifact && (
                <button
                  type="button"
                  title={strings.inspector.viewArtifact}
                  aria-label={strings.inspector.viewArtifact}
                  className="p-1 text-muted hover:text-accent transition pointer-events-auto"
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectArtifact(pinned.artifactRef);
                  }}
                >
                  <Box size={13} strokeWidth={1.5} />
                </button>
              )}
              {missingFromFolder && (
                <button
                  type="button"
                  title={strings.card.removeFromCanvas}
                  className="p-1 text-danger hover:bg-danger-muted rounded transition pointer-events-auto"
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); onDeleteCard(); }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              )}
              {hasMultipleVersions && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleVersionStack(); }}
                  className="relative p-1 text-muted hover:text-secondary transition"
                  title={strings.card.versions}
                >
                  <Layers size={13} strokeWidth={1.5} />
                  {hasNewerDraft && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-accent rounded-full"></span>
                  )}
                </button>
              )}
              <span className="sans text-[10px] text-muted">v{card.pinnedVersion}</span>
              <div className="w-1 h-1 rounded-full pin-dot" title={strings.card.pinned}></div>
            </div>
          )}
        </div>

        {showSimplified
          && card.type === 'user_note'
          && isActive
          && !userNoteDisabled
          && !missingFromFolder && (
          <p className="sans text-[9px] text-muted text-center px-2 pb-1 shrink-0 pointer-events-none">
            {strings.userNote.zoomToEdit}
          </p>
        )}
        {showSimplified && missingFromFolder && (
          <button
            type="button"
            title={strings.card.removeFromCanvas}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md text-danger hover:bg-danger-muted pointer-events-auto"
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => { e.stopPropagation(); onDeleteCard(); }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}

        <div
          className={`flex-1 min-h-0 overflow-hidden ${missingFromFolder ? 'bg-danger-muted/30' : ''} ${showSimplified ? 'px-2 pb-2' : 'px-4 pb-4'}`}
          {...(isActive && !showSimplified ? { 'data-artifact-scroll': '' } : {})}
        >
          <CardPreview
            card={card}
            pinned={pinned}
            isActive={isActive && !showSimplified}
            compact={showSimplified}
            onRehydratePreview={onRehydratePreview}
            onInlineSaveUserNote={
              card.type === 'user_note' && isActive && !showSimplified
                ? (payload) => onInlineSaveUserNote?.({ ...payload, name: editName })
                : undefined
            }
            onInlineSaveBookmark={
              card.type === 'bookmark' && isActive && !showSimplified
                ? onInlineSaveBookmark
                : undefined
            }
            userNoteSaving={userNoteSaving}
            bookmarkSaving={bookmarkSaving}
            userNoteDisabled={userNoteDisabled}
            bookmarkEditDisabled={bookmarkEditDisabled}
            userNoteEditTitle={editName}
            userNoteInitialTitle={card.name}
            showTapToEditHint={
              card.type === 'user_note' && !isActive && !showSimplified
            }
            agentChatLiveMessages={agentChatLiveMessages}
            agentChatLiveCardId={agentChatLiveCardId}
            agentChatTranscriptRevision={agentChatTranscriptRevision}
            agentChatThreadIndex={agentChatThreadIndex}
            agentChatConnectorId={agentChatConnectorId}
            folderHandle={folderHandle}
          />
        </div>
      </div>

      {showResizeHandles && (
        <>
          {(['nw', 'ne', 'sw', 'se']).map((corner) => (
            <div
              key={corner}
              role="presentation"
              data-card-resize-handle={corner}
              className="absolute z-50 w-3 h-3 rounded-sm bg-surface border border-border shadow-sm pointer-events-auto hover:border-accent/70 touch-none"
              style={{
                cursor: cornerCursor[corner],
                ...(corner.includes('n') ? { top: -6 } : { bottom: -6 }),
                ...(corner.includes('w') ? { left: -6 } : { right: -6 }),
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onStartResize(e, card, corner);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ))}
        </>
      )}

      {canLinkFrom && onStartLinkDrag && !showSimplified && (
        <button
          type="button"
          data-link-handle
          title={strings.graph.dragToLink}
          className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30 w-5 h-5 rounded-full bg-accent text-on-accent flex items-center justify-center transition shadow touch-none ${
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onStartLinkDrag(e);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link2 size={10} strokeWidth={2} />
        </button>
      )}

      {versionStackOpen && !showSimplified && (
        <div
          className="absolute top-0 left-full ml-3 z-40 bg-surface rounded-lg card-shadow w-56 overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sans text-[10px] uppercase tracking-wider text-muted px-4 pt-3 pb-1">{strings.card.versions}</div>
          <div className="max-h-64 overflow-y-auto">
            {versions.map((v) => (
              <button
                key={v.version}
                onClick={() => onPinVersion(v.version)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-surface-muted transition ${v.version === card.pinnedVersion ? 'bg-warning-muted' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="serif text-sm text-primary">v{v.version}</div>
                  <div className="sans text-[10px] text-muted truncate">{v.filename}</div>
                </div>
                {v.version === card.pinnedVersion ? (
                  <div className="flex items-center gap-1 text-warning">
                    <div className="w-1.5 h-1.5 rounded-full pin-dot"></div>
                    <span className="sans text-[10px]">{strings.card.pinnedLabel}</span>
                  </div>
                ) : v.version > card.pinnedVersion ? (
                  <span className="sans text-[10px] text-accent">{strings.card.newer}</span>
                ) : (
                  <span className="sans text-[10px] text-muted">{strings.card.older}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
