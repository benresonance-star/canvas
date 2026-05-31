import React, { useEffect, useState } from 'react';
import { strings } from '../content/strings.js';
import { fetchArtifactEdges } from '../lib/primitivesApi.js';

export function CardLinkedSection({
  artifactRef,
  cards,
  onFocusCard,
  onInspect,
  variant = 'bottom',
}) {
  const [edges, setEdges] = useState(null);
  const [loading, setLoading] = useState(false);
  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    if (!artifactRef?.id) {
      setEdges(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchArtifactEdges(artifactRef.id);
        if (!cancelled) setEdges(data);
      } catch {
        if (!cancelled) setEdges({ outgoing: [], incoming: [], notesOnTarget: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifactRef?.id]);

  if (!artifactRef?.id) return null;

  const cardByArtifactId = new Map();
  for (const c of cards) {
    const pinned =
      c.versions?.find((v) => v.version === c.pinnedVersion) || c.versions?.[0];
    if (pinned?.artifactRef?.id) cardByArtifactId.set(pinned.artifactRef.id, c);
  }

  const resolveLabel = (artifactId) => {
    const card = cardByArtifactId.get(artifactId);
    return card ? `${card.name} (${card.key})` : artifactId.slice(0, 12) + '…';
  };

  const outgoing = edges?.outgoing?.filter(
    (r) => r.from_id === artifactRef.id && r.from_type === 'artifact',
  ) || [];
  const incoming = edges?.incoming || [];
  const notes = edges?.notesOnTarget || [];

  if (loading) {
    return (
      <p
        className={`sans text-[10px] text-muted italic ${
          isSidebar ? 'px-4 py-3' : 'mt-4'
        }`}
      >
        {strings.inspector.loading}
      </p>
    );
  }

  if (outgoing.length === 0 && incoming.length === 0 && notes.length === 0) return null;

  return (
    <section className={isSidebar ? 'px-4 py-3' : 'mt-4 pt-4 border-t border-border-subtle'}>
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
        {strings.graph.linked}
      </div>
      {outgoing.length > 0 && (
        <div className="mb-2">
          <div className="sans text-[10px] text-muted mb-1">{strings.graph.outgoing}</div>
          <ul className="space-y-1">
            {outgoing.map((r) => (
              <li key={r.id}>
                <LinkRow
                  label={`${r.type} → ${resolveLabel(r.to_id)}`}
                  artifactId={r.to_id}
                  cardByArtifactId={cardByArtifactId}
                  onFocusCard={onFocusCard}
                  onInspect={onInspect}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {incoming.length > 0 && (
        <div className="mb-2">
          <div className="sans text-[10px] text-muted mb-1">{strings.graph.referencedBy}</div>
          <ul className="space-y-1">
            {incoming.map((r) => (
              <li key={r.id}>
                <LinkRow
                  label={`${resolveLabel(r.from_id)} → ${r.type}`}
                  artifactId={r.from_id}
                  cardByArtifactId={cardByArtifactId}
                  onFocusCard={onFocusCard}
                  onInspect={onInspect}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <div>
          <div className="sans text-[10px] text-muted mb-1">{strings.graph.notesOnArtifact}</div>
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="sans text-xs text-link hover:text-link-hover hover:underline text-left"
                  onClick={() => onInspect?.({ type: 'note', id: n.id })}
                >
                  {(n.body || '').split('\n')[0]?.slice(0, 60) || 'Note'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function LinkRow({ label, artifactId, cardByArtifactId, onFocusCard, onInspect }) {
  const card = cardByArtifactId.get(artifactId);
  return (
    <button
      type="button"
      className="sans text-xs text-link hover:text-link-hover hover:underline text-left"
      onClick={() => {
        if (card) onFocusCard?.(card.id);
        else onInspect?.({ type: 'artifact', id: artifactId });
      }}
    >
      {label}
    </button>
  );
}
