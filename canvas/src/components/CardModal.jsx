import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Box, File, Pin, X, Trash2 } from 'lucide-react';
import {
  canOpenArtifactExternally,
  openArtifactExternally,
} from '../lib/openArtifactExternally.js';
import { ArtifactNotesPanel } from './ArtifactNotesPanel.jsx';
import { ArtifactPrimitiveSection } from './ArtifactPrimitiveSection.jsx';
import { AddAssertionForm } from './AddAssertionForm.jsx';
import { CardLinkedSection } from './CardLinkedSection.jsx';
import { cardHeaderLabel } from '../lib/filename.js';
import { strings } from '../content/strings.js';
import { ModalContent } from './ModalContent.jsx';
import { UserNoteEditor } from './UserNoteEditor.jsx';
import { BookmarkCardEditor } from './BookmarkCardEditor.jsx';
import { AgentSidePanel } from './AgentSidePanel.jsx';
import { ARTIFACT_SIDEBAR_STORAGE_KEY } from '../lib/constants.js';

function readStoredSidebarOpen() {
  try {
    return localStorage.getItem(ARTIFACT_SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function persistSidebarOpen(open) {
  try {
    localStorage.setItem(ARTIFACT_SIDEBAR_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function CardModal({
  card,
  clusterId,
  cards = [],
  folderHandle,
  projectId,
  projectName,
  onClose,
  onPinVersion,
  onDeleteCard,
  onUpdateVersion,
  missingFromFolder,
  onInspectArtifact,
  onFocusCard,
  onGraphRefresh,
  onSaveStatus,
  userNoteDisabled = false,
  bookmarkEditDisabled = false,
  onSaveBookmark,
  bookmarkSaving = false,
  onSaveNoteToProject,
  onUpdateCard,
  agentPanelProps = null,
}) {
  const [currentVersion, setCurrentVersion] = useState(card?.pinnedVersion ?? 1);
  const [sidebarOpen, setSidebarOpen] = useState(readStoredSidebarOpen);
  const [agentOpen, setAgentOpen] = useState(false);
  const [editName, setEditName] = useState(card?.name ?? '');
  const noteEditorRef = useRef(null);
  const version = card?.versions.find(v => v.version === currentVersion);
  const isUserNote = card?.type === 'user_note';
  const isBookmark = card?.type === 'bookmark';
  const noteEditBlocked = missingFromFolder && userNoteDisabled;

  useEffect(() => {
    setEditName(card?.name ?? '');
    setAgentOpen(false);
  }, [card?.id, card?.name]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      persistSidebarOpen(next);
      return next;
    });
  }, []);

  const canOpenExternal = canOpenArtifactExternally({
    folderHandle,
    version,
    missingFromFolder,
    cardType: card.type,
  });

  const handleOpenExternal = useCallback(async () => {
    const result = await openArtifactExternally({
      folderHandle,
      version,
      cardType: card.type,
    });
    if (result.ok) return;
    if (result.error === 'use_folder') {
      onSaveStatus?.({
        toast: strings.modal.openExternalUseFolder
          .replace('{filename}', result.filename ?? version?.filename ?? '')
          .replace('{folder}', result.folderName ?? folderHandle?.name ?? ''),
      });
      return;
    }
    if (result.error === 'popup_blocked') {
      onSaveStatus?.({ toast: strings.modal.openExternalPopupBlocked });
      return;
    }
    if (result.error === 'reconnect_folder') {
      onSaveStatus?.({ toast: strings.modal.openExternalReconnect });
      return;
    }
    const message =
      result.error === 'unavailable'
        ? strings.modal.openExternalUnavailable
        : strings.modal.openExternalFailed;
    onSaveStatus?.({ error: message });
  }, [folderHandle, version, onSaveStatus]);

  if (!card) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-overlay)] backdrop-blur-sm flex flex-col">
      {missingFromFolder && (
        <div className="sans shrink-0 mx-6 mt-4 px-4 py-2 rounded-md bg-danger-muted text-danger text-xs border border-danger-border">
          {strings.modal.missingFromFolder}
        </div>
      )}
      <div className="flex items-center justify-between px-6 py-4 text-on-overlay">
        <div className="min-w-0">
          <div className="sans text-[10px] uppercase tracking-wider text-on-overlay/70 mb-0.5">{cardHeaderLabel(card)}</div>
          {isUserNote && !noteEditBlocked ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => noteEditorRef.current?.saveIfDirty()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className={`w-full min-w-0 serif text-xl bg-transparent border-0 border-b border-on-overlay/30 focus:border-on-overlay/60 focus:outline-none px-0 py-0.5 ${
                missingFromFolder ? 'text-danger' : 'text-on-overlay'
              }`}
              aria-label={strings.userNote.name}
            />
          ) : (
            <div className={`serif text-xl truncate ${missingFromFolder ? 'text-danger' : ''}`}>
              {card.name}
            </div>
          )}
          {isUserNote && (
            <p className="sans text-[10px] text-on-overlay/60 mt-1">{strings.userNote.editHint}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {canOpenExternal && (
            <button
              type="button"
              title={strings.modal.openExternal}
              onClick={() => void handleOpenExternal()}
              className="sans flex items-center gap-1 text-xs text-on-overlay/80 hover:text-on-overlay px-2 py-1 rounded transition hover:bg-on-overlay/10"
            >
              <File size={14} strokeWidth={1.5} aria-hidden />
            </button>
          )}
          {agentPanelProps && !isBookmark && !isUserNote && (
            <button
              type="button"
              title={strings.agent.askAboutArtifact}
              aria-pressed={agentOpen}
              onClick={() => {
                setAgentOpen((open) => {
                  const next = !open;
                  if (next) {
                    void agentPanelProps.onOpen?.();
                  }
                  return next;
                });
              }}
              className={`sans flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
                agentOpen
                  ? 'text-on-overlay bg-on-overlay/15'
                  : 'text-on-overlay/80 hover:text-on-overlay hover:bg-on-overlay/10'
              }`}
            >
              <Bot size={14} strokeWidth={1.5} aria-hidden />
              {strings.agent.openAgentMode}
            </button>
          )}
          {!isUserNote && (
            <button
              type="button"
              title={sidebarOpen ? strings.modal.collapseSidebar : strings.modal.expandSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="artifact-modal-sidebar"
              onClick={toggleSidebar}
              className={`sans flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
                sidebarOpen
                  ? 'text-on-overlay bg-on-overlay/15'
                  : 'text-on-overlay/80 hover:text-on-overlay hover:bg-on-overlay/10'
              }`}
            >
              <Box size={14} strokeWidth={1.5} aria-hidden />
            </button>
          )}
          {missingFromFolder && (
            <button
              type="button"
              title={strings.card.removeFromCanvas}
              onClick={() => onDeleteCard(card.id)}
              className="sans flex items-center gap-1.5 text-xs bg-danger-muted hover:bg-danger-border text-danger px-3 py-1.5 rounded transition border border-danger-border"
            >
              <Trash2 size={14} strokeWidth={1.8} /> {strings.card.remove}
            </button>
          )}
          {card.versions.length > 1 && (
            <select
              value={currentVersion}
              onChange={e => setCurrentVersion(parseInt(e.target.value))}
              className="sans bg-accent text-on-accent text-xs rounded px-2 py-1.5 border border-border"
            >
              {card.versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version}{' '}
                  {v.version === card.pinnedVersion
                    ? strings.modal.versionPinned
                    : v.version > card.pinnedVersion
                      ? strings.modal.versionNewer
                      : ''}
                </option>
              ))}
            </select>
          )}
          {currentVersion !== card.pinnedVersion && (
            <button
              onClick={() => onPinVersion(card.id, currentVersion)}
              className="sans flex items-center gap-1.5 text-xs bg-accent hover:bg-accent-hover text-on-accent px-3 py-1.5 rounded transition"
            >
              <Pin size={12} strokeWidth={1.8} /> {strings.card.pinThisVersion}
            </button>
          )}
          <button onClick={onClose} className="text-on-overlay/70 hover:text-on-overlay transition p-1">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="flex-1 mx-6 mb-6 min-h-0 flex flex-col">
        {isBookmark ? (
          <div className="flex-1 bg-canvas rounded-lg overflow-hidden min-h-0 flex flex-col">
            <BookmarkCardEditor
              card={card}
              version={version}
              saving={bookmarkSaving}
              disabled={bookmarkEditDisabled}
              onSave={onSaveBookmark}
            />
          </div>
        ) : isUserNote ? (
          <div className="flex-1 bg-canvas rounded-lg overflow-hidden min-h-0 flex flex-col">
            <UserNoteEditor
              ref={noteEditorRef}
              card={card}
              version={version}
              versionNum={currentVersion}
              title={editName}
              folderHandle={folderHandle}
              projectId={projectId}
              projectName={projectName}
              clusterId={clusterId}
              cards={cards}
              missingFromFolder={missingFromFolder}
              userNoteDisabled={userNoteDisabled}
              onUpdateVersion={onUpdateVersion}
              onUpdateCard={onUpdateCard}
              onGraphRefresh={onGraphRefresh}
              onSaveStatus={onSaveStatus}
              onCancelEdit={() => setEditName(card.name)}
              onSaveToProject={onSaveNoteToProject}
            />
          </div>
        ) : (
          <div className="flex-1 bg-canvas rounded-lg overflow-hidden min-h-0 flex flex-col md:flex-row relative">
            <div className="relative flex-1 min-w-0 min-h-[40vh] md:min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ModalContent card={card} version={version} />
              </div>
            </div>
            <aside
              id="artifact-modal-sidebar"
              aria-label={strings.modal.artifactSidebar}
              className={`shrink-0 bg-surface flex flex-col min-h-0 transition-[width,max-height] duration-200 ease-out ${
                sidebarOpen
                  ? 'w-full max-md:max-h-[45vh] max-md:border-t max-md:border-border md:w-72 lg:w-80 md:overflow-hidden md:border-l md:border-border'
                  : 'w-0 max-h-0 overflow-hidden border-0 md:pointer-events-none'
              }`}
            >
              {sidebarOpen && (
                <>
                  <div className="shrink-0 max-md:overflow-y-auto">
                    <ArtifactPrimitiveSection
                      variant="sidebar"
                      artifactRef={version?.artifactRef}
                    />
                    <AddAssertionForm
                      variant="sidebar"
                      artifactRef={version?.artifactRef}
                      clusterId={clusterId}
                    />
                    <CardLinkedSection
                      variant="sidebar"
                      artifactRef={version?.artifactRef}
                      cards={cards}
                      onFocusCard={onFocusCard}
                      onInspect={onInspectArtifact}
                    />
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col border-t border-border max-md:min-h-[12rem]">
                    <ArtifactNotesPanel
                      variant="sidebar"
                      artifactRef={version?.artifactRef}
                      clusterId={clusterId}
                      onGraphRefresh={onGraphRefresh}
                    />
                  </div>
                </>
              )}
            </aside>
            {agentOpen && agentPanelProps && (
              <aside
                aria-label={strings.agent.askAboutArtifact}
                className="shrink-0 bg-surface flex flex-col min-h-[18rem] max-md:max-h-[55vh] max-md:border-t max-md:border-border md:w-96 md:border-l md:border-border"
              >
                <AgentSidePanel
                  className="flex-1 min-h-0"
                  onClose={() => setAgentOpen(false)}
                  {...agentPanelProps}
                />
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
