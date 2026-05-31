import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { listPrimitives, createRelationship } from '../lib/primitivesApi.js';

export function LinkArtifactDialog({
  clusterId,
  fromRef,
  onClose,
  onLinked,
}) {
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!clusterId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listPrimitives(clusterId, { type: 'artifact', limit: 200 });
        if (!cancelled) {
          setArtifacts(
            (data.items || []).filter((a) => a.id !== fromRef?.id),
          );
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
  }, [clusterId, fromRef?.id]);

  const filtered = artifacts.filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (a.summary || '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
  });

  const handlePick = async (target) => {
    if (!clusterId || !fromRef) return;
    setSaving(true);
    setError(null);
    try {
      await createRelationship(
        clusterId,
        {
          from_ref: fromRef,
          to_ref: { id: target.id, type: 'artifact' },
          type: 'references',
          provenance: [fromRef],
        },
        { idempotent: true },
      );
      onLinked?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl flex flex-col max-h-[70vh]">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">{strings.linkArtifact.title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>
        <div className="px-4 py-2 border-b border-border-subtle">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={strings.linkArtifact.search}
            className="w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <p className="sans text-xs text-muted italic p-2">{strings.inspector.loading}</p>
          )}
          {error && <p className="sans text-xs text-danger p-2">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="sans text-xs text-muted italic p-2">{strings.linkArtifact.empty}</p>
          )}
          <ul className="space-y-1">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handlePick(a)}
                  className="w-full text-left sans text-xs px-3 py-2 rounded hover:bg-surface-muted text-primary disabled:opacity-50"
                >
                  <span className="text-muted uppercase text-[10px] mr-2">{a.status || 'artifact'}</span>
                  {a.summary || a.id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
