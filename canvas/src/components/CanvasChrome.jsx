import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  RefreshCw,
  StickyNote,
  Link2,
  Bot,
  ZoomIn,
  ZoomOut,
  Network,
  CircuitBoard,
} from 'lucide-react';
import { strings } from '../content/strings.js';
import { resolveSyncBanner, shouldShowRefreshFromServer } from '../lib/syncUi.js';
import { clampZoomPercent, parseZoomPercentInput } from '../lib/canvasView.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { ProjectSwitcher } from './ProjectSwitcher.jsx';

function ZoomPercentInput({ canvasView, onZoomPercentCommit }) {
  const inputRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const displayPercent = Math.round(canvasView.zoom * 100);

  useEffect(() => {
    if (!isEditing) {
      setDraft(String(displayPercent));
    }
  }, [displayPercent, isEditing]);

  const commit = () => {
    const parsed = parseZoomPercentInput(draft);
    if (parsed === null) {
      setDraft(String(displayPercent));
      setIsEditing(false);
      return;
    }
    onZoomPercentCommit(clampZoomPercent(parsed));
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(String(displayPercent));
    setIsEditing(false);
    inputRef.current?.blur();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      aria-label={strings.canvas.zoomPercentLabel}
      value={isEditing ? draft : `${displayPercent}%`}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setIsEditing(true);
        setDraft(String(displayPercent));
        e.target.select();
      }}
      onBlur={() => {
        if (isEditing) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      className="sans text-[10px] text-secondary w-12 text-center bg-transparent border-0 focus:outline-none focus:text-primary"
    />
  );
}

export function CanvasChrome({
  projectList,
  activeProjectId,
  projectName,
  onProjectNameChange,
  onProjectNameBlur,
  onSwitchProject,
  projectSwitchLoading = false,
  onCreateProject,
  onArchiveProject,
  onUnarchiveProject,
  onDeleteProjectRequest,
  onViewPrimitives,
  onCreateTask,
  onOpenAgentMode,
  workspaceTreeOpen,
  onToggleWorkspaceTree,
  agentPanelOpen,
  onToggleAgentPanel,
  onOpenSearch,
  onOpenArchitecture,
  canvasView,
  onZoomOut,
  onZoomIn,
  onZoomPercentCommit,
  onResetView,
  syncStatus,
  syncLock = 'live',
  onRefreshFromServer,
  onUseServerProjectCopy,
  onKeepMyProjectCopy,
  onClearLocalCache,
  showClearLocalCache = false,
  folderDisplayName,
  connectedFolderName,
  folderNeedsReconnect,
  folderNeedsConnect = false,
  folderFooterSyncHidden = false,
  folderLinked,
  onChangeFolder,
  onNewNote,
  onAddLink,
  onSync,
  onReconnectFolder,
  onConnectFolder,
  cardCount,
  selectedCardCount,
  clusterApiAvailable = true,
  clusterApiUnavailableMessage = null,
  onGroupSelection,
  showDesktopControls = true,
}) {
  const bannerMessage = resolveSyncBanner(syncLock, syncStatus?.banner);
  const showRefresh = shouldShowRefreshFromServer(
    syncLock,
    syncStatus?.banner,
    Boolean(onRefreshFromServer),
  );

  return (
    <div className="fixed inset-0 z-30 pointer-events-none" aria-hidden={false}>
      <header className="fixed top-0 left-0 right-0 px-6 py-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2">
          <ProjectSwitcher
            projects={projectList}
            activeProjectId={activeProjectId}
            switchDisabled={projectSwitchLoading}
            onSwitch={onSwitchProject}
            onCreate={onCreateProject}
            onArchive={onArchiveProject}
            onUnarchive={onUnarchiveProject}
            onDeleteRequest={onDeleteProjectRequest}
            onViewPrimitives={onViewPrimitives}
            onCreateTask={onCreateTask}
            onOpenAgentMode={onOpenAgentMode}
          />
          <input
            value={projectName}
            disabled={!activeProjectId}
            onChange={(e) => onProjectNameChange(e.target.value)}
            onBlur={() => onProjectNameBlur?.()}
            className="sans bg-transparent text-xs uppercase tracking-[0.18em] text-secondary focus:text-primary focus:outline-none w-64 disabled:opacity-40"
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <ThemeToggle />
          {onOpenArchitecture && (
            <button
              type="button"
              onClick={onOpenArchitecture}
              aria-label={strings.architecture.open}
              title={strings.architecture.open}
              className="sans text-xs text-muted hover:text-secondary transition flex items-center gap-1.5"
            >
              <CircuitBoard size={13} strokeWidth={1.5} />
            </button>
          )}
          {showDesktopControls && (
            <button
              type="button"
              onClick={onToggleWorkspaceTree}
              aria-label={strings.workspaceTree.toggle}
              className={`sans text-xs transition flex items-center gap-1.5 ${
                workspaceTreeOpen ? 'text-accent' : 'text-muted hover:text-secondary'
              }`}
            >
              <Network size={13} strokeWidth={1.5} />
            </button>
          )}
          {showDesktopControls && (
            <button
              type="button"
              onClick={onToggleAgentPanel}
              className={`sans text-xs transition flex items-center gap-1.5 ${
                agentPanelOpen ? 'text-accent' : 'text-muted hover:text-secondary'
              }`}
            >
              <Bot size={13} strokeWidth={1.5} />
              <span className="hidden sm:inline">{strings.agent.toggleAgent}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={strings.search.label}
            className="sans text-xs text-muted hover:text-secondary transition flex items-center gap-1.5"
          >
            <Search size={13} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {showDesktopControls && !clusterApiAvailable && clusterApiUnavailableMessage && (
        <div className="fixed bottom-28 left-6 right-6 sm:right-auto sm:max-w-md pointer-events-auto z-10">
          <p
            className="sans text-[10px] text-warning leading-snug bg-warning-muted border border-warning-border rounded-lg px-3 py-2"
            role="status"
          >
            {clusterApiUnavailableMessage}
          </p>
        </div>
      )}

      {showDesktopControls && selectedCardCount > 0 && (
        <div className="fixed bottom-20 left-6 flex flex-col items-start gap-1 pointer-events-none">
          <button
            type="button"
            onClick={onGroupSelection}
            disabled={!clusterApiAvailable}
            title={
              clusterApiAvailable
                ? undefined
                : (clusterApiUnavailableMessage ?? strings.cluster.createApiUnavailable)
            }
            className="sans text-xs bg-accent text-on-accent px-3 py-1.5 rounded-full shadow pointer-events-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {strings.cluster.groupFromSelection} ({selectedCardCount})
          </button>
          <span className="sans text-[9px] text-muted pointer-events-none">
            {strings.cluster.shiftClickHint}
          </span>
        </div>
      )}

      {showDesktopControls && (
      <div className="fixed bottom-6 left-6 pointer-events-auto flex items-center gap-1 bg-surface/80 backdrop-blur border border-border rounded-full px-1 py-1">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 text-secondary hover:text-primary transition"
        >
          <ZoomOut size={14} strokeWidth={1.5} />
        </button>
        <ZoomPercentInput
          canvasView={canvasView}
          onZoomPercentCommit={onZoomPercentCommit}
        />
        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 text-secondary hover:text-primary transition"
        >
          <ZoomIn size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onResetView}
          title={strings.canvas.resetTitle}
          className="sans text-[10px] text-muted hover:text-secondary px-2 transition"
        >
          {strings.canvas.reset}
        </button>
      </div>
      )}

      {showDesktopControls && (
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 pointer-events-none">
        {bannerMessage && (
          <div className="sans text-xs bg-surface-muted text-secondary border border-border px-3 py-2 rounded max-w-sm pointer-events-auto leading-snug flex flex-col gap-2">
            <span>{bannerMessage}</span>
            {showRefresh && (
              <button
                type="button"
                onClick={onRefreshFromServer}
                className="sans self-start text-xs bg-accent hover:bg-accent-hover text-on-accent px-3 py-1.5 rounded-full transition"
              >
                {strings.projects.refreshFromServer}
              </button>
            )}
            {syncStatus?.conflictActions && onUseServerProjectCopy && (
              <button
                type="button"
                onClick={onUseServerProjectCopy}
                className="sans self-start text-xs bg-accent hover:bg-accent-hover text-on-accent px-3 py-1.5 rounded-full transition"
              >
                {strings.projects.useServerProjectCopy}
              </button>
            )}
            {syncStatus?.conflictActions && onKeepMyProjectCopy && (
              <button
                type="button"
                onClick={onKeepMyProjectCopy}
                className="sans self-start text-xs border border-border text-secondary hover:text-primary px-3 py-1.5 rounded-full transition"
              >
                {strings.projects.keepMyProjectCopy}
              </button>
            )}
            {showClearLocalCache && onClearLocalCache && (
              <button
                type="button"
                onClick={onClearLocalCache}
                className="sans self-start text-xs border border-border text-secondary hover:text-primary px-3 py-1.5 rounded-full transition"
              >
                {strings.projects.clearLocalCache}
              </button>
            )}
          </div>
        )}
        {syncStatus?.error && (
          <div className="sans text-xs bg-danger-muted text-danger border border-danger-border px-3 py-2 rounded max-w-xs pointer-events-auto">
            {syncStatus.error}
          </div>
        )}
        {syncStatus?.noChanges && (
          <div className="sans text-xs bg-surface-muted text-secondary border border-border px-3 py-2 rounded pointer-events-auto">
            {strings.sync.nothingNew}
          </div>
        )}
        {syncStatus?.previewsRestored && (
          <div className="sans text-xs bg-success-muted text-success border border-success-border px-3 py-2 rounded max-w-xs pointer-events-auto">
            {strings.sync.previewsRestored}
          </div>
        )}
        {syncStatus?.toast && (
          <div className="sans text-xs bg-warning-muted text-warning border border-warning-border px-3 py-2 rounded max-w-xs pointer-events-auto">
            {syncStatus.toast}
          </div>
        )}
        {folderNeedsConnect && connectedFolderName && (
          <div className="flex flex-col items-end gap-1.5 max-w-[16rem] pointer-events-auto">
            <p className="sans text-[10px] text-warning text-right leading-snug">
              {strings.sync.connectFolderNamed(connectedFolderName)}
            </p>
            {onConnectFolder && (
              <button
                type="button"
                onClick={onConnectFolder}
                disabled={syncStatus?.scanning}
                className="sans text-xs bg-accent hover:bg-accent-hover text-on-accent px-3 py-1.5 rounded-full transition disabled:opacity-50"
              >
                {strings.sync.connectFolderAction}
              </button>
            )}
          </div>
        )}
        {folderNeedsReconnect && (
          <div className="flex flex-col items-end gap-1.5 max-w-[16rem] pointer-events-auto">
            <p className="sans text-[10px] text-warning text-right leading-snug">
              {connectedFolderName
                ? strings.sync.reconnectFolderNamed(connectedFolderName)
                : strings.sync.reconnectFolderHint}
            </p>
            {onReconnectFolder && (
              <button
                type="button"
                onClick={onReconnectFolder}
                disabled={syncStatus?.scanning}
                className="sans text-xs bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30 px-3 py-1.5 rounded-full transition disabled:opacity-50"
              >
                {strings.sync.reconnectFolderAction}
              </button>
            )}
          </div>
        )}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onAddLink}
            disabled={syncLock !== 'live'}
            className="sans flex items-center gap-2 bg-surface border border-border hover:bg-surface-muted text-primary text-xs px-4 py-2.5 rounded-full transition shadow-lg disabled:opacity-50"
          >
            <Link2 size={13} strokeWidth={1.8} />
            {strings.projects.addLink}
          </button>
          {folderLinked && (
            <button
              type="button"
              onClick={onNewNote}
              disabled={syncLock !== 'live'}
              className="sans flex items-center gap-2 bg-surface border border-border hover:bg-surface-muted text-primary text-xs px-4 py-2.5 rounded-full transition shadow-lg disabled:opacity-50"
            >
              <StickyNote size={13} strokeWidth={1.8} />
              {strings.projects.newNote}
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-0.5 bg-surface/80 backdrop-blur border border-border rounded-full pl-2 pr-1 py-1 max-w-[min(100vw-3rem,22rem)]">
          {folderDisplayName && (folderLinked || connectedFolderName) && (
            <>
              <span
                className="sans text-[10px] text-secondary truncate min-w-0 flex-1"
                title={folderDisplayName}
              >
                {folderDisplayName}
              </span>
              <span className="w-px h-3 bg-border shrink-0" aria-hidden />
            </>
          )}
          {folderLinked && (
            <>
              <button
                type="button"
                onClick={onChangeFolder}
                className="sans text-[10px] uppercase tracking-wider text-muted hover:text-secondary shrink-0 px-1 transition"
              >
                {strings.sync.changeFolder}
              </button>
              <span className="w-px h-3 bg-border shrink-0" aria-hidden />
            </>
          )}
          {!folderFooterSyncHidden && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncStatus?.scanning}
              className="sans flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-on-accent text-xs px-3 py-1.5 rounded-full transition disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                size={13}
                strokeWidth={1.8}
                className={syncStatus?.scanning ? 'animate-spin' : ''}
              />
              {folderLinked
                ? strings.sync.sync
                : folderNeedsReconnect
                  ? strings.sync.reconnectFolderAction
                  : strings.sync.connectFolder}
            </button>
          )}
        </div>
        {cardCount > 0 && (
          <div className="sans text-[10px] uppercase tracking-wider text-muted pointer-events-auto">
            {cardCount}{' '}
            {cardCount === 1 ? strings.sync.artefact : strings.sync.artefacts}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
