import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { isLinkableArtifactType } from '../lib/ingest/linkIngest.js';
import {
  getPrimitiveDetail,
  fetchArtifactEdges,
  deleteRelationship,
  listPrimitives,
} from '../lib/primitivesApi.js';
import { LinkTargetDialog } from './LinkTargetDialog.jsx';
import { ClusterManagementSection } from './ClusterManagementSection.jsx';
import { buildArtifactToCardMap } from '../lib/graph/clusterGraph.js';
import { formatDurationSec } from '../lib/audio/parseAudioTags.js';
import { FieldRow } from './FieldRow.jsx';
import { ImageArtifactMetadataFields } from './ImageArtifactMetadataFields.jsx';

function stripPrimitivePrefix(summary) {
  return summary?.replace(/^[^:]+:\s*/, '') || '';
}

function truncateId(id, n = 8) {
  if (!id) return '';
  return id.length > n ? `${id.slice(0, n)}...` : id;
}

function buildPrimitiveLabelMap(items = []) {
  const labels = new Map();
  for (const item of items) {
    if (!item?.type || !item?.id) continue;
    const label =
      item.type === 'artifact'
        ? stripPrimitivePrefix(item.summary) || item.id
        : item.summary || `${item.type}:${truncateId(item.id)}`;
    labels.set(`${item.type}:${item.id}`, label);
  }
  return labels;
}

export function PrimitiveInspectorPanel({
  variant = 'overlay',
  selection,
  clusterId,
  clusterInspectorReload = 0,
  cards = [],
  selectedCardIds,
  activeCardId = null,
  agentChatThreadIndex = null,
  singleConnectorId = null,
  onClose,
  onSelectPrimitive,
  onOpenCardKey,
  onGraphRefresh,
  onClusterRenamed,
  onClusterDeleted,
}) {
  const embedded = variant === 'embedded';
  const [detail, setDetail] = useState(null);
  const [artifactEdges, setArtifactEdges] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [primitiveLabels, setPrimitiveLabels] = useState(() => new Map());

  const artifactMap = useMemo(() => buildArtifactToCardMap(cards), [cards]);

  const isClusterSelection = selection?.type === 'cluster';

  const labelForArtifact = (artifactId) => {
    const hit = artifactMap.get(artifactId);
    if (hit) return `${hit.name} (${hit.cardKey})`;
    const primitiveLabel = primitiveLabels.get(`artifact:${artifactId}`);
    if (primitiveLabel) return primitiveLabel;
    return hit ? `${hit.name} (${hit.cardKey})` : `${artifactId.slice(0, 12)}…`;
  };

  const labelForEdgeEndpoint = (edge, isFrom) => {
    const id = isFrom ? edge.from_id : edge.to_id;
    const type = isFrom ? edge.from_type : edge.to_type;
    if (type === 'artifact') return labelForArtifact(id);
    if (type === 'note') return `note:${id.slice(0, 8)}…`;
    return `${type}:${id.slice(0, 8)}…`;
  };

  useEffect(() => {
    if (!clusterId) {
      setPrimitiveLabels(new Map());
      return undefined;
    }
    let cancelled = false;
    listPrimitives(clusterId, { limit: 500 })
      .then((data) => {
        if (!cancelled) setPrimitiveLabels(buildPrimitiveLabelMap(data.items || []));
      })
      .catch(() => {
        if (!cancelled) setPrimitiveLabels(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, clusterInspectorReload, reloadKey]);

  useEffect(() => {
    if (!selection || isClusterSelection) {
      if (isClusterSelection) {
        setDetail(null);
        setArtifactEdges(null);
        setLoading(false);
      }
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPrimitiveDetail(selection.type, selection.id);
        if (!cancelled) setDetail(data);
        if (!cancelled && selection.type === 'artifact') {
          const edges = await fetchArtifactEdges(selection.id);
          if (!cancelled) setArtifactEdges(edges);
        } else if (!cancelled) {
          setArtifactEdges(null);
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
  }, [selection, reloadKey, isClusterSelection]);

  if (!selection) return null;

  const p = detail?.primitive;
  const meta =
    p?.metadata && typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p?.metadata;

  const fromRef =
    selection.type === 'artifact' ? { id: selection.id, type: 'artifact' } : null;

  const canLinkFrom =
    selection.type === 'artifact' && isLinkableArtifactType(p?.type, meta);

  const handleUnlink = async (relId) => {
    try {
      await deleteRelationship(relId);
      setReloadKey((k) => k + 1);
      onGraphRefresh?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleLinked = () => {
    setReloadKey((k) => k + 1);
    onGraphRefresh?.();
  };

  const panel = (
      <aside
        className={
          embedded
            ? 'inspector-panel relative w-full flex-1 min-h-0 flex flex-col bg-surface'
            : 'inspector-panel relative w-full max-w-md h-full bg-surface border-l border-border shadow-2xl pointer-events-auto flex flex-col'
        }
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <div className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.inspector.title}
            </div>
            <div className="sans text-xs text-primary uppercase">{selection.type}</div>
            <div className="sans text-[10px] text-muted font-mono truncate max-w-[16rem]">
              {selection.id}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted hover:text-primary rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isClusterSelection ? (
            <ClusterManagementSection
              clusterId={selection.id}
              cards={cards}
              selectedCardIds={selectedCardIds}
              activeCardId={activeCardId}
              agentChatThreadIndex={agentChatThreadIndex}
              singleConnectorId={singleConnectorId}
              reloadKey={clusterInspectorReload}
              onGraphRefresh={onGraphRefresh}
              onClusterRenamed={onClusterRenamed}
              onClusterDeleted={onClusterDeleted}
              onSelectPrimitive={onSelectPrimitive}
              onOpenCardKey={onOpenCardKey}
              onViewArtifact={onSelectPrimitive}
            />
          ) : (
            <>
              {loading && (
                <p className="sans text-xs text-muted italic">{strings.inspector.loading}</p>
              )}
              {error && <p className="sans text-xs text-danger">{error}</p>}
              {!loading && !error && p && (
                <>
                  {selection.type === 'artifact' && (
                    <>
                      <FieldRow label="URI" value={p.uri} />
                      <FieldRow label="Hash" value={p.content_hash} />
                      <FieldRow label="Type" value={p.type} />
                      <FieldRow label="File" value={meta?.filename} />
                      <ImageArtifactMetadataFields meta={meta} />
                      {meta?.canvas_kind === 'audio' && meta?.audio && (
                        <>
                          <FieldRow label={strings.audio.title} value={meta.audio.title} />
                          <FieldRow label={strings.audio.artist} value={meta.audio.artist} />
                          <FieldRow label={strings.audio.album} value={meta.audio.album} />
                          <FieldRow
                            label={strings.audio.duration}
                            value={
                              meta.audio.durationSec != null
                                ? formatDurationSec(meta.audio.durationSec)
                                : null
                            }
                          />
                          <FieldRow label={strings.audio.genre} value={meta.audio.genre} />
                          <FieldRow label={strings.audio.year} value={meta.audio.year} />
                          <FieldRow label={strings.audio.track} value={meta.audio.track} />
                        </>
                      )}
                      {p.type === 'agent_chat' && (
                        <FieldRow
                          label="Connector"
                          value={meta?.connectorLabel || meta?.connectorId}
                        />
                      )}
                      {(p.type === 'user_note'
                        || p.type === 'user_task'
                        || p.type === 'agent_chat'
                        || (p.type === 'doc' && meta?.canvas_kind === 'code'))
                        && p.payload_text && (
                        <section className="py-2">
                          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">
                            {p.type === 'agent_chat'
                              ? 'Chat transcript'
                              : strings.inspector.payloadPreview}
                          </div>
                          <pre className="sans text-xs text-secondary whitespace-pre-wrap font-serif max-h-48 overflow-y-auto">
                            {p.payload_text}
                          </pre>
                        </section>
                      )}
                      {canLinkFrom && clusterId && (
                        <button
                          type="button"
                          className="mt-2 sans text-xs text-link hover:text-link-hover hover:underline"
                          onClick={() => setLinkOpen(true)}
                        >
                          {strings.linkArtifact.link}
                        </button>
                      )}
                      {artifactEdges?.incoming?.length > 0 && (
                        <section className="mt-4">
                          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
                            {strings.graph.referencedBy}
                          </div>
                          <ul className="space-y-1">
                            {artifactEdges.incoming.map((e) => (
                              <li key={e.id} className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="sans text-xs text-link hover:text-link-hover hover:underline text-left"
                                  onClick={() =>
                                    onSelectPrimitive?.({ id: e.from_id, type: e.from_type })
                                  }
                                >
                                  {labelForArtifact(e.from_id)} → {e.type}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </>
                  )}
                  {selection.type === 'note' && (
                    <>
                      <FieldRow label="Target" value={labelForArtifact(p.target_id)} />
                      <div className="py-2">
                        <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">
                          Body
                        </div>
                        <pre className="sans text-xs text-secondary whitespace-pre-wrap font-serif">
                          {p.body}
                        </pre>
                      </div>
                    </>
                  )}
                  {selection.type === 'relationship' && (
                    <>
                      <FieldRow label="Type" value={p.type} />
                      <FieldRow label="From" value={labelForEdgeEndpoint(p, true)} />
                      <FieldRow label="To" value={labelForEdgeEndpoint(p, false)} />
                    </>
                  )}
                  {selection.type === 'assertion' && (
                    <>
                      <FieldRow label="Predicate" value={p.predicate} />
                      <FieldRow label="Status" value={p.status} />
                      <FieldRow
                        label="Subject"
                        value={`${p.subject_ref?.type}:${p.subject_ref?.id}`}
                      />
                      <FieldRow
                        label="Object"
                        value={
                          p.object_ref
                            ? `${p.object_ref.type}:${p.object_ref.id}`
                            : JSON.stringify(p.object_literal)
                        }
                      />
                    </>
                  )}
                  {selection.type === 'task' && (
                    <>
                      <FieldRow label="Intent" value={p.intent} />
                      <FieldRow label="Type" value={p.type} />
                      <FieldRow label="Status" value={p.status} />
                      {p.inputs?.length > 0 && (
                        <FieldRow
                          label="Inputs"
                          value={p.inputs.map((r) => `${r.type}:${r.id}`).join(', ')}
                        />
                      )}
                      {p.outputs?.length > 0 && (
                        <FieldRow
                          label="Outputs"
                          value={p.outputs.map((r) => `${r.type}:${r.id}`).join(', ')}
                        />
                      )}
                    </>
                  )}

                  {detail.edges?.length > 0 && (
                    <section className="mt-4">
                      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
                        {strings.inspector.edges}
                      </div>
                      <ul className="space-y-1">
                        {detail.edges.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              className="text-left sans text-xs text-link hover:text-link-hover hover:underline flex-1"
                              onClick={() => {
                                const other =
                                  e.from_id === selection.id && e.from_type === selection.type
                                    ? { id: e.to_id, type: e.to_type }
                                    : { id: e.from_id, type: e.from_type };
                                onSelectPrimitive?.(other);
                              }}
                            >
                              {e.type}{' '}
                              {e.from_id === selection.id ? '→' : '←'}{' '}
                              {e.from_id === selection.id
                                ? labelForEdgeEndpoint(e, false)
                                : labelForEdgeEndpoint(e, true)}
                            </button>
                            {e.type !== 'note_attachment' && selection.type === 'artifact' && (
                              <button
                                type="button"
                                className="sans text-[10px] text-danger shrink-0"
                                onClick={() => void handleUnlink(e.id)}
                              >
                                {strings.graph.unlink}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {detail.provenance?.length > 0 && (
                    <section className="mt-4">
                      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
                        {strings.inspector.provenance}
                      </div>
                      <ul className="space-y-1">
                        {detail.provenance.map((pr, i) => (
                          <li key={`${pr.source_id || pr.id}-${i}`}>
                            <button
                              type="button"
                              className="sans text-xs text-link hover:text-link-hover hover:underline"
                              onClick={() =>
                                onSelectPrimitive?.({
                                  id: pr.source_id || pr.id,
                                  type: pr.source_type || pr.type,
                                })
                              }
                            >
                              {pr.source_type || pr.type}:
                              {(pr.source_id || pr.id)?.slice(0, 12)}…
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                </>
              )}
            </>
          )}
        </div>
      </aside>
  );

  const linkDialog =
    linkOpen && fromRef ? (
      <LinkTargetDialog
        clusterId={clusterId}
        fromRef={fromRef}
        cards={cards}
        multi
        onClose={() => setLinkOpen(false)}
        onLinked={handleLinked}
      />
    ) : null;

  if (embedded) {
    return (
      <>
        {panel}
        {linkDialog}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      {panel}
      {linkDialog}
    </div>
  );
}
