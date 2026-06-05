import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Check, Archive, Trash2, RotateCcw, Plus, RefreshCw } from 'lucide-react';
import { strings } from '../content/strings.js';

function formatProjectIdSuffix(id) {
  if (!id || id.length < 6) return id ?? '';
  return id.slice(-6);
}

function formatRelativeTime(updatedAt) {
  if (!updatedAt) return null;
  const diff = Date.now() - updatedAt;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function ProjectRow({
  project,
  isActive,
  onSwitch,
  onArchive,
  onDelete,
  onUnarchive,
  archived,
  switchDisabled,
}) {
  const nameClass = archived
    ? 'text-muted'
    : isActive
      ? 'text-primary'
      : 'text-secondary';
  const relative = formatRelativeTime(project.updatedAt);

  return (
    <div
      className={`rounded-md ${isActive ? 'bg-warning-muted' : 'hover:bg-surface-muted'}`}
    >
      <div className="flex items-center gap-0.5 pr-1">
        <button
          type="button"
          disabled={switchDisabled && isActive}
          onClick={() => onSwitch(project.id)}
          className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isActive && <Check size={12} className="text-accent shrink-0" strokeWidth={2} />}
          {!isActive && archived && <span className="w-3 shrink-0" />}
          <span className="min-w-0 flex flex-col gap-0.5">
            <span className={`sans text-xs uppercase tracking-[0.18em] truncate ${nameClass}`}>
              {project.name}
            </span>
            <span className="sans text-[10px] normal-case tracking-normal text-muted truncate">
              {formatProjectIdSuffix(project.id)}
              {relative ? ` · ${relative}` : ''}
            </span>
            {project.syncState === 'missing' && (
              <span className="sans text-[10px] normal-case tracking-normal text-muted truncate">
                {strings.projects.syncMissingBody}
              </span>
            )}
            {project.syncState === 'error' && (
              <span className="sans text-[10px] normal-case tracking-normal text-muted truncate">
                {strings.projects.syncErrorBody}
              </span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {archived ? (
            <button
              type="button"
              onClick={() => onUnarchive(project.id)}
              title={strings.projects.unarchive}
              aria-label={strings.projects.unarchive}
              className="p-1.5 text-muted hover:text-secondary rounded hover:bg-surface-muted"
            >
              <RotateCcw size={13} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onArchive(project.id)}
              title={strings.projects.archive}
              aria-label={strings.projects.archive}
              className="p-1.5 text-muted hover:text-secondary rounded hover:bg-surface-muted"
            >
              <Archive size={13} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(project)}
            title={strings.projects.delete}
            aria-label={strings.projects.delete}
            className="p-1.5 text-muted hover:text-danger rounded hover:bg-danger-muted"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSwitch,
  onCreate,
  onRefreshProjects,
  onArchive,
  onUnarchive,
  onDeleteRequest,
  onViewPrimitives,
  onCreateTask,
  onOpenAgentMode,
  switchDisabled = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const closePopover = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closePopover();
    };
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closePopover();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const handleArchive = (id) => {
    if (id === activeProjectId) closePopover();
    onArchive(id);
  };

  const handleDelete = (project) => {
    closePopover();
    onDeleteRequest(project);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={strings.projects.switcherLabel}
        aria-label={strings.projects.switcherLabel}
        aria-expanded={open}
        className="sans p-1.5 text-muted hover:text-secondary transition rounded-md hover:bg-surface-muted/80"
      >
        <LayoutGrid size={15} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-surface border border-border rounded-lg shadow-2xl overflow-visible">
          <div className="px-3 py-2 border-b border-border rounded-t-lg bg-surface flex items-center justify-between gap-2">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.projects.menuTitle}
            </div>
            <button
              type="button"
              onClick={() => {
                onCreate();
                closePopover();
              }}
              className="sans text-[10px] uppercase tracking-wider text-accent hover:text-primary flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent-muted border border-accent-border/60"
            >
              <Plus size={12} strokeWidth={2} />
              {strings.projects.newProject}
            </button>
          </div>
          {onRefreshProjects && (
            <div className="px-3 py-2 border-b border-border-subtle bg-surface">
              <button
                type="button"
                onClick={() => {
                  void onRefreshProjects();
                  closePopover();
                }}
                className="sans text-[10px] uppercase tracking-wider text-secondary hover:text-primary flex items-center gap-1.5 transition"
              >
                <RefreshCw size={12} strokeWidth={1.8} />
                {strings.projects.refreshProjects}
              </button>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {active.length === 0 ? (
              <div className="px-3 py-2 sans text-[10px] text-muted italic">
                {strings.projects.emptyWorkspaceBody}
              </div>
            ) : (
              active.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isActive={p.id === activeProjectId}
                  switchDisabled={switchDisabled}
                  onSwitch={(id) => {
                    if (switchDisabled && id === activeProjectId) return;
                    onSwitch(id);
                    closePopover();
                  }}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onUnarchive={onUnarchive}
                />
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-border-subtle bg-surface">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.projects.archived}
            </div>
          </div>
          {archived.length === 0 ? (
            <div className="px-3 py-2 sans text-[10px] text-muted italic">
              {strings.projects.archivedEmpty}
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto py-1">
              {archived.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isActive={p.id === activeProjectId}
                  archived
                  switchDisabled={switchDisabled}
                  onSwitch={(id) => {
                    if (switchDisabled && id === activeProjectId) return;
                    onSwitch(id);
                    closePopover();
                  }}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onUnarchive={(id) => {
                    onUnarchive(id);
                  }}
                />
              ))}
            </div>
          )}
          <div className="border-t border-border p-1 rounded-b-lg bg-surface flex flex-col gap-0.5">
            {onViewPrimitives && (
              <button
                type="button"
                onClick={() => {
                  onViewPrimitives();
                  closePopover();
                }}
                className="w-full text-left px-3 py-2 sans text-xs text-secondary hover:bg-surface-muted rounded-md transition"
              >
                {strings.projects.viewPrimitives}
              </button>
            )}
            {onCreateTask && (
              <button
                type="button"
                onClick={() => {
                  onCreateTask();
                  closePopover();
                }}
                className="w-full text-left px-3 py-2 sans text-xs text-secondary hover:bg-surface-muted rounded-md transition"
              >
                {strings.projects.createTask}
              </button>
            )}
            {onOpenAgentMode && (
              <button
                type="button"
                onClick={() => {
                  onOpenAgentMode();
                  closePopover();
                }}
                className="w-full text-left px-3 py-2 sans text-xs text-secondary hover:bg-surface-muted rounded-md transition"
              >
                {strings.agent.openAgentMode}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
