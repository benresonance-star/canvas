import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { buildWorkspaceTree } from '../lib/buildWorkspaceTree.js';
import { getLegendEntries } from '../lib/primitiveTreeColors.js';
import {
  isApiAvailable,
  listClusterEvents,
  listPrimitives,
} from '../lib/primitivesApi.js';

const EXPANDED_STORAGE_KEY = 'canvas.workspaceTree.expanded.v1';

const DEFAULT_EXPANDED = new Set([
  'workspace-root',
  'clusters',
  'artifacts',
  'notes',
  'relationships',
  'assertions',
  'tasks',
  'events',
]);

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_EXPANDED);
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set(DEFAULT_EXPANDED);
    return new Set(ids);
  } catch {
    return new Set(DEFAULT_EXPANDED);
  }
}

function saveExpanded(set) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function TypePill({ color, label, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 sans text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border/60 ${className}`}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelectLeaf,
}) {
  const isBranch = node.kind !== 'leaf';
  const isExpanded = expanded.has(node.id);
  const pad = 8 + depth * 12;

  if (node.kind === 'leaf') {
    return (
      <button
        type="button"
        style={{ paddingLeft: pad }}
        className="w-full flex items-center gap-2 py-1 pr-2 text-left hover:bg-surface-muted/80 rounded transition group"
        onClick={() => onSelectLeaf(node.primitiveRef)}
        disabled={!node.primitiveRef}
      >
        <span className="w-3 shrink-0" />
        {node.color && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: node.color }}
            aria-hidden
          />
        )}
        <span className="sans text-[11px] text-secondary group-hover:text-primary truncate flex-1">
          {node.label}
        </span>
      </button>
    );
  }

  const count = node.count ?? node.children?.length ?? 0;

  return (
    <>
      <button
        type="button"
        style={{ paddingLeft: pad }}
        className="w-full flex items-center gap-1.5 py-1 pr-2 text-left hover:bg-surface-muted/60 rounded transition"
        onClick={() => onToggle(node.id)}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-muted shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted shrink-0" />
        )}
        {node.color && node.kind === 'subtype' && (
          <TypePill color={node.color} label={node.label} />
        )}
        {node.kind !== 'subtype' && (
          <span className="sans text-[11px] text-primary font-medium truncate">{node.label}</span>
        )}
        {node.kind === 'subtype' && <span className="flex-1" />}
        <span className="sans text-[9px] text-muted tabular-nums">{count}</span>
      </button>
      {isExpanded &&
        node.children?.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onSelectLeaf={onSelectLeaf}
          />
        ))}
    </>
  );
}

function WorkspaceLegend({ legendOpen, onToggleLegend }) {
  const entries = useMemo(() => getLegendEntries(), []);

  return (
    <div className="border-b border-border shrink-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-muted/50 transition"
        onClick={onToggleLegend}
        aria-expanded={legendOpen}
      >
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          {strings.workspaceTree.legend}
        </span>
        {legendOpen ? (
          <ChevronDown size={12} className="text-muted" />
        ) : (
          <ChevronRight size={12} className="text-muted" />
        )}
      </button>
      {legendOpen && (
        <div className="px-3 pb-3 space-y-2 max-h-40 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.sectionId}>
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.kindColor }}
                />
                <span className="sans text-[10px] text-secondary">{entry.label}</span>
              </div>
              {entry.subtypes.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-3">
                  {entry.subtypes.map((st) => (
                    <TypePill key={st.id} color={st.color} label={st.label} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceTreePanel({
  className = '',
  clusterId,
  projectName,
  subclusters = [],
  reloadKey = 0,
  onClose,
  onSelectPrimitive,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiOffline, setApiOffline] = useState(false);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [legendOpen, setLegendOpen] = useState(true);

  const toggleExpanded = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpanded(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!clusterId) {
      setItems([]);
      setEvents([]);
      setApiOffline(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const available = await isApiAvailable();
        if (!available) {
          if (!cancelled) {
            setApiOffline(true);
            setItems([]);
            setEvents([]);
          }
          return;
        }
        if (!cancelled) setApiOffline(false);

        const [primData, eventData] = await Promise.all([
          listPrimitives(clusterId, { limit: 500 }),
          listClusterEvents(clusterId, { limit: 200 }).catch(() => ({ items: [] })),
        ]);

        if (!cancelled) {
          setItems(primData.items || []);
          setEvents(eventData.items || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clusterId, reloadKey]);

  const tree = useMemo(
    () =>
      buildWorkspaceTree({
        projectName: projectName || strings.defaultProjectName,
        items,
        events,
        subclusters,
      }),
    [projectName, items, events, subclusters],
  );

  const handleSelectLeaf = useCallback(
    (ref) => {
      if (ref?.type && ref?.id) onSelectPrimitive?.(ref);
    },
    [onSelectPrimitive],
  );

  return (
    <div
      className={`flex flex-col min-h-0 bg-surface border-b border-border ${className}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <h2 className="sans text-xs uppercase tracking-wider text-primary">
          {strings.workspaceTree.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted hover:text-primary transition"
          aria-label={strings.workspaceTree.close}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      <WorkspaceLegend legendOpen={legendOpen} onToggleLegend={() => setLegendOpen((o) => !o)} />

      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {!clusterId && (
          <p className="sans text-xs text-muted px-3">{strings.workspaceTree.emptyNoCluster}</p>
        )}
        {clusterId && apiOffline && (
          <p className="sans text-xs text-muted px-3">{strings.workspaceTree.apiRequired}</p>
        )}
        {clusterId && !apiOffline && loading && (
          <p className="sans text-xs text-muted px-3">{strings.workspaceTree.loading}</p>
        )}
        {clusterId && !apiOffline && error && (
          <p className="sans text-xs text-danger px-3">{error}</p>
        )}
        {clusterId && !apiOffline && !loading && !error && tree.count === 0 && (
          <p className="sans text-xs text-muted px-3">{strings.workspaceTree.empty}</p>
        )}
        {clusterId && !apiOffline && !loading && !error && tree.count > 0 && (
          <TreeNodeRow
            node={tree}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpanded}
            onSelectLeaf={handleSelectLeaf}
          />
        )}
      </div>
    </div>
  );
}
