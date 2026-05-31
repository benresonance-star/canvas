import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { listPrimitives } from '../lib/primitivesApi.js';

const FILTERS = ['', 'artifact', 'note', 'relationship', 'assertion', 'task', 'cluster'];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function PrimitiveTableModal({
  clusterId,
  open,
  onClose,
  onSelectRow,
  initialFilter = '',
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !clusterId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await listPrimitives(clusterId, {
          type: filter || undefined,
          limit: 100,
        });
        if (!cancelled) setItems(data.items || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clusterId, filter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">
            {strings.inspector.viewPrimitives}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>

        <div className="px-4 py-2 flex flex-wrap gap-1 border-b border-border-subtle">
          {FILTERS.map((f) => (
            <button
              key={f || 'all'}
              type="button"
              onClick={() => setFilter(f)}
              className={`sans text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                filter === f
                  ? 'bg-accent text-on-accent'
                  : 'text-muted hover:bg-surface-muted'
              }`}
            >
              {f || 'All'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <p className="p-4 sans text-xs text-muted italic">{strings.inspector.loading}</p>
          )}
          {error && (
            <p className="p-4 sans text-xs text-danger">{error}</p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="p-4 sans text-xs text-muted italic">
              {!clusterId
                ? strings.inspector.emptyNoCluster
                : strings.inspector.empty}
            </p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr>
                  <th className="sans text-[10px] uppercase tracking-wider text-muted px-4 py-2">
                    Type
                  </th>
                  <th className="sans text-[10px] uppercase tracking-wider text-muted px-4 py-2">
                    Summary
                  </th>
                  <th className="sans text-[10px] uppercase tracking-wider text-muted px-4 py-2">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={`${row.type}-${row.id}`}
                    className="border-b border-border-subtle hover:bg-surface-muted cursor-pointer"
                    tabIndex={0}
                    onClick={() => onSelectRow({ type: row.type, id: row.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSelectRow({ type: row.type, id: row.id });
                    }}
                  >
                    <td className="px-4 py-2 sans text-[10px] uppercase text-secondary">
                      {row.type}
                    </td>
                    <td className="px-4 py-2 sans text-xs text-primary truncate max-w-xs">
                      {row.summary}
                    </td>
                    <td className="px-4 py-2 sans text-[10px] text-muted whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
