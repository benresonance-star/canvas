import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Box, File, Pin, X, Trash2 } from 'lucide-react';
import {
  canOpenArtifactExternally,
  openArtifactExternally,
} from '../lib/openArtifactExternally.js';
import { ArtifactNotesPanel } from './ArtifactNotesPanel.jsx';
import { ArtifactPrimitiveSection } from './ArtifactPrimitiveSection.jsx';
import { AddAssertionForm } from './AddAssertionForm.jsx';
import { CardLinkedSection } from './CardLinkedSection.jsx';
import { cardHeaderLabel, cardDisplayFilename } from '../lib/filename.js';
import { strings } from '../content/strings.js';
import { ModalContent } from './ModalContent.jsx';
import { UserNoteEditor } from './UserNoteEditor.jsx';
import { BookmarkCardEditor } from './BookmarkCardEditor.jsx';
import { AgentSidePanel } from './AgentSidePanel.jsx';
import { ARTIFACT_SIDEBAR_STORAGE_KEY } from '../lib/constants.js';
import {
  readFlowAgentUiState,
  writeFlowAgentUiState,
  flowAgentPanelLayoutToCollapsedSections,
  collapsedSectionsToFlowAgentPanelLayout,
} from '../lib/flowAgentUiPersistence.js';
import {
  planFlowAgentUiRestore,
  shouldAutoPersistFlowAgentThread,
  buildFlowAgentUiFlushPayload,
} from '../lib/flowAgentUiRestore.js';
import { FlowEditor } from '../features/flow/components/FlowEditor.jsx';
import { useFlowAgentContext } from '../features/flow/hooks/useFlowAgentContext.js';
import { SpreadsheetViewerSelect } from './SpreadsheetViewerSelect.jsx';
import { useSpreadsheetViewerPreference } from '../hooks/useSpreadsheetViewerPreference.js';
import { isCsvSpreadsheet } from '../lib/spreadsheetViewer.js';

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
  folderConnected = false,
  folderKeySet = null,
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
  flowArtifactCandidates = [],
  onFlowCardRefresh,
  onRehydratePreview,
  registerFlowFlush,
}) {
  const [currentVersion, setCurrentVersion] = useState(card?.pinnedVersion ?? 1);
  const [sidebarOpen, setSidebarOpen] = useState(readStoredSidebarOpen);
  const [agentOpen, setAgentOpen] = useState(false);
  const [flowAgentCollapsedSections, setFlowAgentCollapsedSections] = useState({
    setup: false,
    context: false,
  });
  const [editName, setEditName] = useState(card?.name ?? '');
  const [flowClosing, setFlowClosing] = useState(false);
  const [flowCloseError, setFlowCloseError] = useState(null);
  const noteEditorRef = useRef(null);
  const flowSnapshotGetterRef = useRef(null);
  const restoredFlowAgentUiRef = useRef(false);
  const pendingFlowThreadRestoreRef = useRef(null);
  const lastFlowAgentThreadRef = useRef(null);
  const prevAgentOpenRef = useRef(false);
  const agentOpenRef = useRef(agentOpen);
  const flowAgentCollapsedSectionsRef = useRef(flowAgentCollapsedSections);
  const agentPanelPropsRef = useRef(agentPanelProps);
  const version = card?.versions.find(v => v.version === currentVersion);
  const isUserNote = card?.type === 'user_note';
  const isBookmark = card?.type === 'bookmark';
  const isFlow = card?.type === 'flow';
  const isSpreadsheet = card?.type === 'spreadsheet';
  const noteEditBlocked = missingFromFolder && userNoteDisabled;
  const { viewer: spreadsheetViewer, setViewer: setSpreadsheetViewer } = useSpreadsheetViewerPreference();

  const getFlowSnapshot = useCallback(
    () => flowSnapshotGetterRef.current?.() ?? null,
    [],
  );

  const handleClose = useCallback(async () => {
    if (flowClosing) return;
    setFlowCloseError(null);
    setFlowClosing(true);
    try {
      const closed = await onClose();
      if (closed === false) {
        setFlowCloseError(strings.flow.unsavedChanges);
        return;
      }
    } finally {
      setFlowClosing(false);
    }
  }, [flowClosing, onClose]);

  const flowAgent = useFlowAgentContext({
    flowCard: card,
    canvasCards: cards,
    getFlowSnapshot,
  });

  useEffect(() => {
    if (!isFlow || !agentOpen || !agentPanelProps?.registerFlowContextLoader) {
      agentPanelProps?.registerFlowContextLoader?.(null);
      return undefined;
    }
    agentPanelProps.registerFlowContextLoader(flowAgent.loadFlowContextText);
    return () => agentPanelProps.registerFlowContextLoader(null);
  }, [
    agentOpen,
    agentPanelProps,
    flowAgent.loadFlowContextText,
    isFlow,
  ]);

  useEffect(() => {
    agentPanelProps?.registerEmbeddedAgentPanelOpen?.(agentOpen);
    return () => agentPanelProps?.registerEmbeddedAgentPanelOpen?.(false);
  }, [agentOpen, agentPanelProps?.registerEmbeddedAgentPanelOpen]);

  useEffect(() => {
    agentOpenRef.current = agentOpen;
  }, [agentOpen]);

  useEffect(() => {
    flowAgentCollapsedSectionsRef.current = flowAgentCollapsedSections;
  }, [flowAgentCollapsedSections]);

  useEffect(() => {
    agentPanelPropsRef.current = agentPanelProps;
  }, [agentPanelProps]);

  const persistFlowAgentUi = useCallback((partial) => {
    if (!projectId || !card?.id) return;
    writeFlowAgentUiState(projectId, card.id, partial);
    if (partial?.activeThreadId) {
      lastFlowAgentThreadRef.current = {
        threadId: partial.activeThreadId,
        connectorId: partial.connectorId ?? agentPanelPropsRef.current?.singleConnectorId ?? null,
      };
    }
  }, [projectId, card?.id]);

  const flushFlowAgentUiSnapshot = useCallback(() => {
    if (!isFlow || !projectId || !card?.id) return;
    const panel = agentPanelPropsRef.current;
    const threadId = panel?.activeThreadId ?? lastFlowAgentThreadRef.current?.threadId ?? null;
    const connectorId = panel?.singleConnectorId
      ?? lastFlowAgentThreadRef.current?.connectorId
      ?? null;
    writeFlowAgentUiState(
      projectId,
      card.id,
      buildFlowAgentUiFlushPayload({
        collapsedSections: flowAgentCollapsedSectionsRef.current,
        activeThreadId: threadId,
        connectorId,
      }),
    );
    if (threadId) {
      lastFlowAgentThreadRef.current = { threadId, connectorId };
    }
  }, [isFlow, projectId, card?.id]);

  const handleCloseFlowAgent = useCallback(() => {
    flushFlowAgentUiSnapshot();
    setAgentOpen(false);
  }, [flushFlowAgentUiSnapshot]);

  const handleFlowCollapsedSectionsChange = useCallback((sections) => {
    setFlowAgentCollapsedSections(sections);
    if (!isFlow || !agentOpen || !projectId || !card?.id) return;
    persistFlowAgentUi({
      panelLayout: collapsedSectionsToFlowAgentPanelLayout(sections),
    });
  }, [isFlow, agentOpen, projectId, card?.id, persistFlowAgentUi]);

  useEffect(() => {
    if (!isFlow || !agentOpen || !projectId || !card?.id || !agentPanelProps) return;
    if (!shouldAutoPersistFlowAgentThread(restoredFlowAgentUiRef.current)) return;
    const threadId = agentPanelProps.activeThreadId ?? null;
    if (!threadId) return;
    persistFlowAgentUi({
      activeThreadId: threadId,
      connectorId: agentPanelProps.singleConnectorId ?? null,
    });
  }, [
    isFlow,
    agentOpen,
    projectId,
    card?.id,
    agentPanelProps?.activeThreadId,
    agentPanelProps?.singleConnectorId,
    persistFlowAgentUi,
    agentPanelProps,
  ]);

  useEffect(() => {
    if (prevAgentOpenRef.current && !agentOpen && isFlow) {
      flushFlowAgentUiSnapshot();
    }
    prevAgentOpenRef.current = agentOpen;
  }, [agentOpen, isFlow, flushFlowAgentUiSnapshot]);

  useEffect(() => {
    if (!isFlow || !projectId || !card?.id) return undefined;
    const flushFlowAgentUi = () => {
      flushFlowAgentUiSnapshot();
    };
    window.addEventListener('pagehide', flushFlowAgentUi);
    return () => {
      window.removeEventListener('pagehide', flushFlowAgentUi);
      flushFlowAgentUiSnapshot();
    };
  }, [isFlow, projectId, card?.id, flushFlowAgentUiSnapshot]);

  useEffect(() => {
    if (!isFlow || !agentOpen || !projectId || !card?.id || !agentPanelProps) return;
    if (restoredFlowAgentUiRef.current || pendingFlowThreadRestoreRef.current) return;

    const plan = planFlowAgentUiRestore(
      readFlowAgentUiState(projectId, card.id),
      agentPanelProps.singleConnectorId ?? null,
    );

    if (plan.collapsedSections) {
      setFlowAgentCollapsedSections(plan.collapsedSections);
    }

    if (plan.pendingThreadRestore) {
      lastFlowAgentThreadRef.current = {
        threadId: plan.pendingThreadRestore.threadId,
        connectorId: plan.pendingThreadRestore.connectorId,
      };
    }

    if (plan.restoreComplete) {
      restoredFlowAgentUiRef.current = true;
      return;
    }

    pendingFlowThreadRestoreRef.current = plan.pendingThreadRestore;

    if (plan.connectorIdToSwitch) {
      agentPanelProps.onSingleConnectorChange?.(plan.connectorIdToSwitch);
    }
  }, [
    isFlow,
    agentOpen,
    projectId,
    card?.id,
    agentPanelProps,
  ]);

  useEffect(() => {
    const pending = pendingFlowThreadRestoreRef.current;
    if (!isFlow || !agentOpen || !pending || restoredFlowAgentUiRef.current || !agentPanelProps) {
      return;
    }
    if (pending.connectorId && pending.connectorId !== agentPanelProps.singleConnectorId) {
      return;
    }

    const threads = agentPanelProps.chatThreads ?? [];
    if (threads.length === 0) {
      if (agentPanelProps.threadPickerOpen) {
        restoredFlowAgentUiRef.current = true;
        pendingFlowThreadRestoreRef.current = null;
      }
      return;
    }
    if (!threads.some((thread) => thread.threadId === pending.threadId)) {
      restoredFlowAgentUiRef.current = true;
      pendingFlowThreadRestoreRef.current = null;
      return;
    }

    if (agentPanelProps.activeThreadId === pending.threadId) {
      restoredFlowAgentUiRef.current = true;
      pendingFlowThreadRestoreRef.current = null;
      return;
    }

    restoredFlowAgentUiRef.current = true;
    pendingFlowThreadRestoreRef.current = null;
    void agentPanelProps.onSelectThread?.(pending.threadId);
  }, [
    isFlow,
    agentOpen,
    agentPanelProps?.singleConnectorId,
    agentPanelProps?.chatThreads,
    agentPanelProps?.activeThreadId,
    agentPanelProps?.onSelectThread,
    agentPanelProps?.threadPickerOpen,
    agentPanelProps,
  ]);

  useEffect(() => {
    if (!agentOpen) {
      restoredFlowAgentUiRef.current = false;
      pendingFlowThreadRestoreRef.current = null;
    }
  }, [agentOpen]);

  const flowAgentPanelProps = useMemo(() => {
    if (!agentPanelProps || !isFlow) return agentPanelProps;
    return {
      ...agentPanelProps,
      contextScope: 'flow',
      contextMode: 'selected',
      contextCards: flowAgent.contextCards,
      flowIncludeNetwork: flowAgent.includeNetwork,
      onFlowIncludeNetworkChange: flowAgent.setIncludeNetwork,
      flowSelectionSummary: flowAgent.selectionSummary,
      initialCollapsedSections: flowAgentCollapsedSections,
      onCollapsedSectionsChange: handleFlowCollapsedSectionsChange,
      onSingleConnectorChange: (connectorId) => {
        agentPanelProps.onSingleConnectorChange?.(connectorId);
        if (agentOpenRef.current) {
          const threadId = agentPanelPropsRef.current?.activeThreadId
            ?? lastFlowAgentThreadRef.current?.threadId
            ?? null;
          if (threadId) {
            persistFlowAgentUi({ activeThreadId: threadId, connectorId });
          }
        }
      },
      onSelectThread: async (threadId) => {
        await agentPanelProps.onSelectThread?.(threadId);
        persistFlowAgentUi({
          activeThreadId: threadId,
          connectorId: agentPanelPropsRef.current?.singleConnectorId ?? null,
        });
      },
      onCreateThread: async () => {
        await agentPanelProps.onCreateThread?.();
        queueMicrotask(() => flushFlowAgentUiSnapshot());
      },
      onDeleteThread: async () => {
        await agentPanelProps.onDeleteThread?.();
        persistFlowAgentUi({ activeThreadId: null });
        lastFlowAgentThreadRef.current = null;
      },
    };
  }, [
    agentPanelProps,
    flowAgent,
    isFlow,
    flowAgentCollapsedSections,
    handleFlowCollapsedSectionsChange,
    persistFlowAgentUi,
    flushFlowAgentUiSnapshot,
  ]);

  useEffect(() => {
    setEditName(card?.name ?? '');
  }, [card?.id, card?.name]);

  useEffect(() => {
    setAgentOpen(false);
    restoredFlowAgentUiRef.current = false;
    pendingFlowThreadRestoreRef.current = null;
    lastFlowAgentThreadRef.current = null;
    setFlowAgentCollapsedSections({ setup: false, context: false });
  }, [card?.id]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      persistSidebarOpen(next);
      return next;
    });
  }, []);

  const canOpenExternal = !isFlow && canOpenArtifactExternally({
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
              {cardDisplayFilename(card)}
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
              title={isFlow ? strings.agent.askAboutFlow : strings.agent.askAboutArtifact}
              aria-pressed={agentOpen}
              onClick={() => {
                if (!agentOpen && isFlow && projectId && card?.id) {
                  const stored = readFlowAgentUiState(projectId, card.id);
                  if (stored?.panelLayout) {
                    setFlowAgentCollapsedSections(
                      flowAgentPanelLayoutToCollapsedSections(stored.panelLayout),
                    );
                  }
                }
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
          {!isUserNote && !isFlow && (
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
          {(missingFromFolder || (isBookmark && !bookmarkEditDisabled)) && (
            <button
              type="button"
              title={isBookmark ? strings.bookmark.deleteConfirm : strings.card.removeFromCanvas}
              onClick={() => onDeleteCard(card.id)}
              className="sans flex items-center gap-1.5 text-xs bg-danger-muted hover:bg-danger-border text-danger px-3 py-1.5 rounded transition border border-danger-border"
            >
              <Trash2 size={14} strokeWidth={1.8} /> {isBookmark ? strings.bookmark.deleteConfirm : strings.card.remove}
            </button>
          )}
          {isSpreadsheet && version && (
            <SpreadsheetViewerSelect
              value={spreadsheetViewer}
              onChange={setSpreadsheetViewer}
              allowExtend={!isCsvSpreadsheet(version)}
              className="text-on-overlay [&_span]:text-on-overlay/80"
            />
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
          <button
            aria-label="Close"
            onClick={() => { void handleClose(); }}
            disabled={flowClosing}
            className="text-on-overlay/70 hover:text-on-overlay transition p-1 disabled:opacity-40"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="flex-1 mx-6 mb-6 min-h-0 flex flex-col">
        {flowCloseError && isFlow && (
          <div className="sans shrink-0 mb-3 px-4 py-2 rounded-md bg-danger-muted text-danger text-xs border border-danger-border flex items-center justify-between gap-3">
            <span>{flowCloseError}</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(strings.flow.discardUnsavedClose)) {
                  setFlowCloseError(null);
                  void onClose({ force: true });
                }
              }}
              className="underline shrink-0"
            >
              {strings.flow.closeWithoutSaving}
            </button>
          </div>
        )}
        {isFlow ? (
          <div className="flex-1 bg-canvas rounded-lg overflow-hidden min-h-0 flex flex-col md:flex-row">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
              <FlowEditor
                card={card}
                artifactCandidates={flowArtifactCandidates}
                folderHandle={folderHandle}
                projectId={projectId}
                onRehydratePreview={onRehydratePreview}
                onCardRefresh={onFlowCardRefresh}
                onRegisterContextSnapshot={(getter) => {
                  flowSnapshotGetterRef.current = getter;
                }}
                onRegisterFlush={(getter) => {
                  registerFlowFlush?.(getter);
                }}
                onSelectedNodeIdsChange={flowAgent.setSelectedNodeIds}
                flowAgentScopeNodeIds={agentOpen ? flowAgent.scopeNodeIds : null}
                agentModeActive={agentOpen}
                flowClosing={flowClosing}
              />
            </div>
            {agentOpen && flowAgentPanelProps && (
              <aside
                aria-label={strings.agent.askAboutFlow}
                className="shrink-0 bg-surface flex flex-col min-h-[18rem] max-md:max-h-[55vh] max-md:border-t max-md:border-border md:w-96 md:border-l md:border-border"
              >
                <AgentSidePanel
                  className="flex-1 min-h-0"
                  onClose={handleCloseFlowAgent}
                  {...flowAgentPanelProps}
                />
              </aside>
            )}
          </div>
        ) : isBookmark ? (
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
              folderConnected={Boolean(folderHandle)}
              folderKeySet={folderKeySet}
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
                <ModalContent card={card} version={version} folderHandle={folderHandle} projectId={projectId} />
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
