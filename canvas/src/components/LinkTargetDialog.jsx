import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { createRelationship } from '../lib/primitivesApi.js';
import { cardTypeLabel } from '../lib/filename.js';

export function LinkTargetDialog({
  clusterId,
  fromRef,
  cards = [],
  excludeCardId,
  relationType = 'references',
  onClose,
  onLinked,
  multi = false,
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const targets = useMemo(() => {
    return cards
      .filter((c) => c.id !== excludeCardId)
      .map((c) => {
        const pinned =
          c.versions?.find((v) => v.version === c.pinnedVersion) || c.versions?.[0];
        return {
          cardId: c.id,
          cardKey: c.key,
          name: c.name,
          type: c.type,
          artifactRef: pinned?.artifactRef,
        };
      })
      .filter((t) => t.artifactRef?.id && t.artifactRef.id !== fromRef?.id);
  }, [cards, excludeCardId, fromRef?.id]);

  const filtered = targets.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.cardKey.toLowerCase().includes(q) ||
      t.artifactRef.id.toLowerCase().includes(q)
    );
  });

  const toggle = (cardId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
      } else {
        next.clear();
        next.add(cardId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!clusterId || !fromRef) return;
    const picks = targets.filter((t) => selected.has(t.cardId));
    if (picks.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const t of picks) {
        await createRelationship(
          clusterId,
          {
            from_ref: fromRef,
            to_ref: t.artifactRef,
            type: relationType,
            provenance: [fromRef],
            metadata: { source: 'ui' },
          },
          { idempotent: true },
        );
      }
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
          {filtered.length === 0 && (
            <p className="sans text-xs text-muted italic p-2">{strings.linkArtifact.empty}</p>
          )}
          <ul className="space-y-1">
            {filtered.map((t) => (
              <li key={t.cardId}>
                <button
                  type="button"
                  onClick={() => toggle(t.cardId)}
                  className={`w-full text-left sans text-xs px-3 py-2 rounded ${
                    selected.has(t.cardId) ? 'bg-accent/20 text-primary' : 'hover:bg-surface-muted text-primary'
                  }`}
                >
                  <span className="text-muted uppercase text-[10px] mr-2">
                    {cardTypeLabel(t.type)}
                  </span>
                  {t.name}
                  <span className="text-muted text-[10px] ml-1">({t.cardKey})</span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="sans text-xs text-danger p-2">{error}</p>}
        </div>
        <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-muted px-3 py-1.5">
            {strings.userNote.cancel}
          </button>
          <button
            type="button"
            disabled={saving || selected.size === 0}
            onClick={() => void handleSubmit()}
            className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? strings.userNote.saving : strings.linkArtifact.link}
          </button>
        </footer>
      </div>
    </div>
  );
}
