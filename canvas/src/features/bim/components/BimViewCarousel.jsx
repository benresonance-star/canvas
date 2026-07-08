import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

function ViewThumbnailCard({
  view,
  active,
  thumbnailUrl,
  editing,
  editingLabel,
  onSelect,
  onStartRename,
  onEditingLabelChange,
  onCommitRename,
  onCancelRename,
  onUpdate,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    onCommitRename(view.id, editingLabel);
  }, [editingLabel, onCommitRename, view.id]);

  return (
    <div className="relative w-28 shrink-0 overflow-visible">
      <button
        type="button"
        onClick={() => {
          if (!editing) onSelect(view.id);
        }}
        className={`block w-full overflow-hidden rounded border text-left transition-colors ${
          active ? 'border-accent ring-1 ring-accent/40' : 'border-border hover:border-accent/50'
        }`}
        aria-pressed={active}
        aria-label={`Apply view ${view.label}`}
      >
        <div className="aspect-video w-full bg-surface-muted">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-muted">
              No preview
            </div>
          )}
        </div>
        {editing ? (
          <div className="px-1 py-1" onClick={(event) => event.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editingLabel}
              onChange={(event) => onEditingLabelChange(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              onBlur={() => commitRename()}
              className="w-full rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-secondary"
              aria-label="View label"
            />
          </div>
        ) : (
          <div className="truncate px-1.5 py-1 text-[11px] text-secondary">{view.label}</div>
        )}
      </button>
      <div className="absolute right-1 top-1 z-40">
        <button
          type="button"
          title="View actions"
          aria-label={`Actions for ${view.label}`}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="rounded border border-border bg-surface/95 p-0.5 text-secondary hover:bg-surface-muted"
        >
          <MoreHorizontal size={12} strokeWidth={1.8} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-[9rem] rounded border border-border bg-surface py-1 shadow-lg backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-secondary hover:bg-surface-muted"
              onClick={() => {
                setMenuOpen(false);
                onStartRename(view);
              }}
            >
              <Pencil size={11} strokeWidth={1.8} />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-secondary hover:bg-surface-muted"
              onClick={() => {
                setMenuOpen(false);
                onUpdate(view.id);
              }}
            >
              <RefreshCw size={11} strokeWidth={1.8} />
              Update from viewport
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-warning hover:bg-surface-muted"
              onClick={() => {
                setMenuOpen(false);
                onDelete(view.id);
              }}
            >
              <Trash2 size={11} strokeWidth={1.8} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BimViewCarousel({
  open = false,
  panelRef = null,
  viewSets = [],
  activeViewSetId = null,
  activeViewId = null,
  busy = false,
  status = '',
  error = '',
  loadViewThumbnail = async () => null,
  onSelectViewSet = () => {},
  onCreateViewSet = () => {},
  onRenameViewSet = () => {},
  onDeleteViewSet = () => {},
  onSaveCurrentView = () => {},
  onApplyView = () => {},
  onRenameView = () => {},
  onUpdateView = () => {},
  onDeleteView = () => {},
}) {
  const activeSet = useMemo(
    () => viewSets.find((set) => set.id === activeViewSetId) ?? viewSets[0] ?? null,
    [activeViewSetId, viewSets],
  );
  const thumbnailLoadKey = useMemo(() => {
    if (!activeSet) return '';
    return `${activeSet.id}|${activeSet.views.map((view) => `${view.id}:${view.thumbnailKey}`).join('|')}`;
  }, [activeSet]);
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const thumbnailUrlsRef = useRef({});
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [renamingSet, setRenamingSet] = useState(false);
  const [renamingSetName, setRenamingSetName] = useState('');
  const [saveLabel, setSaveLabel] = useState('View');
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingViewLabel, setEditingViewLabel] = useState('');

  useEffect(() => {
    if (!open) {
      setEditingViewId(null);
      setRenamingSet(false);
    }
  }, [open]);

  useEffect(() => {
    setEditingViewId(null);
    setRenamingSet(false);
  }, [activeSet?.id]);

  useEffect(() => {
    thumbnailUrlsRef.current = thumbnailUrls;
  }, [thumbnailUrls]);

  useEffect(() => () => {
    Object.values(thumbnailUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!open || !activeSet || !thumbnailLoadKey) return undefined;
    let cancelled = false;

    async function loadThumbnails() {
      const entries = await Promise.all(
        activeSet.views.map(async (view) => {
          const blob = await loadViewThumbnail(view.thumbnailKey);
          if (!blob) return [view.id, null];
          return [view.id, URL.createObjectURL(blob)];
        }),
      );
      if (cancelled) {
        entries.forEach(([, url]) => {
          if (url) URL.revokeObjectURL(url);
        });
        return;
      }
      setThumbnailUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return Object.fromEntries(entries.filter(([, url]) => url));
      });
    }

    void loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [activeSet, loadViewThumbnail, open, thumbnailLoadKey]);

  const handleSaveView = useCallback(() => {
    void onSaveCurrentView({ label: saveLabel, setId: activeSet?.id ?? activeViewSetId });
  }, [activeSet?.id, activeViewSetId, onSaveCurrentView, saveLabel]);

  const handleStartRenameView = useCallback((view) => {
    setEditingViewId(view.id);
    setEditingViewLabel(view.label);
  }, []);

  const handleCommitRenameView = useCallback((viewId, label) => {
    const trimmed = label.trim();
    setEditingViewId(null);
    if (!trimmed) return;
    onRenameView(viewId, trimmed);
  }, [onRenameView]);

  const handleCreateSet = useCallback(() => {
    const name = newSetName.trim();
    if (!name) return;
    onCreateViewSet(name);
    setCreatingSet(false);
    setNewSetName('');
  }, [newSetName, onCreateViewSet]);

  const handleCommitRenameSet = useCallback(() => {
    const name = renamingSetName.trim();
    setRenamingSet(false);
    if (!name || !activeSet) return;
    onRenameViewSet(activeSet.id, name);
  }, [activeSet, onRenameViewSet, renamingSetName]);

  if (!open) return null;

  const viewCount = activeSet?.views?.length ?? 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div
        ref={panelRef}
        className="pointer-events-auto flex w-max max-w-[75vw] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm"
        aria-label="View carousel"
        data-view-count={viewCount}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">View sets</span>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-visible">
            {viewSets.map((set) => (
              <button
                key={set.id}
                type="button"
                onClick={() => onSelectViewSet(set.id)}
                className={`shrink-0 rounded border px-2 py-1 text-[10px] uppercase tracking-wide ${
                  set.id === activeSet?.id
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border text-secondary hover:bg-surface-muted'
                }`}
              >
                {set.name}
              </button>
            ))}
            {creatingSet ? (
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="text"
                  value={newSetName}
                  onChange={(event) => setNewSetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleCreateSet();
                    if (event.key === 'Escape') setCreatingSet(false);
                  }}
                  placeholder="Set name"
                  className="w-28 rounded border border-border bg-surface px-2 py-1 text-[11px] text-secondary"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateSet}
                  className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-secondary hover:bg-surface-muted"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                title="Create view set"
                aria-label="Create view set"
                onClick={() => {
                  setCreatingSet(true);
                  setNewSetName('');
                }}
                className="shrink-0 rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-secondary hover:bg-surface-muted"
              >
                + Set
              </button>
            )}
          </div>
          {activeSet && (
            <div className="flex shrink-0 items-center gap-1">
              {renamingSet ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={renamingSetName}
                    onChange={(event) => setRenamingSetName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleCommitRenameSet();
                      if (event.key === 'Escape') setRenamingSet(false);
                    }}
                    onBlur={handleCommitRenameSet}
                    className="w-28 rounded border border-border bg-surface px-2 py-1 text-[11px] text-secondary"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type="button"
                  title="Rename view set"
                  aria-label={`Rename view set ${activeSet.name}`}
                  onClick={() => {
                    setRenamingSet(true);
                    setRenamingSetName(activeSet.name);
                  }}
                  className="rounded border border-border p-1 text-secondary hover:bg-surface-muted"
                >
                  <Pencil size={12} strokeWidth={1.8} />
                </button>
              )}
              <button
                type="button"
                title="Delete view set"
                aria-label={`Delete view set ${activeSet.name}`}
                onClick={() => {
                  if (activeSet.views.length > 0) {
                    const confirmed = window.confirm(`Delete set "${activeSet.name}" and its views?`);
                    if (!confirmed) return;
                  }
                  void onDeleteViewSet(activeSet.id);
                }}
                className="rounded border border-border p-1 text-warning hover:bg-surface-muted"
              >
                <Trash2 size={12} strokeWidth={1.8} />
              </button>
            </div>
          )}
          <input
            type="text"
            value={saveLabel}
            onChange={(event) => setSaveLabel(event.target.value)}
            placeholder="View label"
            className="w-28 shrink-0 rounded border border-border bg-surface px-2 py-1 text-[11px] text-secondary"
            aria-label="New view label"
          />
          <button
            type="button"
            title="Save current viewport as view"
            aria-label="Save current viewport as view"
            disabled={busy || !saveLabel.trim()}
            onClick={handleSaveView}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            <Plus size={12} strokeWidth={1.8} />
            Save view
          </button>
        </div>
        <div className="overflow-x-auto px-3 py-2">
          <div className="flex w-max max-w-full gap-2">
          {viewCount === 0 ? (
            <div className="py-3 text-xs text-muted">
              No views in this set yet. Position the viewport and click Save view.
            </div>
          ) : (
            activeSet.views.map((view) => (
              <ViewThumbnailCard
                key={view.id}
                view={view}
                active={view.id === activeViewId}
                thumbnailUrl={thumbnailUrls[view.id] ?? null}
                editing={editingViewId === view.id}
                editingLabel={editingViewLabel}
                onSelect={onApplyView}
                onStartRename={handleStartRenameView}
                onEditingLabelChange={setEditingViewLabel}
                onCommitRename={handleCommitRenameView}
                onCancelRename={() => setEditingViewId(null)}
                onUpdate={onUpdateView}
                onDelete={onDeleteView}
              />
            ))
          )}
          </div>
        </div>
        {(status || error) && (
          <div className={`border-t border-border px-3 py-1 text-[11px] ${error ? 'text-warning' : 'text-muted'}`}>
            {error || status}
          </div>
        )}
      </div>
    </div>
  );
}
