import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { isLinkableArtifactType } from '../lib/ingest/linkIngest.js';
import {
  getPrimitiveDetail,
  fetchArtifactEdges,
  fetchArtifactEvents,
  deleteRelationship,
  listPrimitives,
} from '../lib/primitivesApi.js';
import { LinkTargetDialog } from './LinkTargetDialog.jsx';
import { ClusterManagementSection } from './ClusterManagementSection.jsx';
import { buildArtifactToCardMap } from '../lib/graph/clusterGraph.js';
import { formatDurationSec } from '../lib/audio/parseAudioTags.js';
import { FieldRow } from './FieldRow.jsx';
import { ImageArtifactMetadataFields } from './ImageArtifactMetadataFields.jsx';
import {
  formatArtifactDateTime,
  resolveArtifactFileDates,
} from '../lib/artifactDates.js';

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

function parseMaybeJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function prettyJson(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    return parsed == null ? value : JSON.stringify(parsed, null, 2);
  }
  return JSON.stringify(value, null, 2);
}

function CollapsibleSchemaSection({ title, open, onToggle, children }) {
  return (
    <section className="border-b border-border-subtle last:border-0 py-2">
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded border px-2.5 py-2 text-left sans text-[10px] uppercase tracking-wider transition-colors ${
          open
            ? 'border-border bg-surface-muted/70 text-primary'
            : 'border-border-subtle bg-canvas/35 text-muted hover:bg-surface-muted/45 hover:text-primary'
        }`}
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}

function JsonBlock({ value, maxHeight = 'max-h-72' }) {
  const text = prettyJson(value);
  if (!text) return null;
  return (
    <pre className={`sans text-[10px] text-secondary whitespace-pre-wrap font-mono ${maxHeight} overflow-y-auto rounded border border-border-subtle bg-canvas/40 p-2`}>
      {text}
    </pre>
  );
}

function TextBlock({ value }) {
  if (value == null || value === '') return null;
  return (
    <pre className="sans text-xs text-secondary whitespace-pre-wrap font-serif max-h-[28rem] overflow-y-auto rounded border border-border-subtle bg-canvas/40 p-2">
      {String(value)}
    </pre>
  );
}

function CapabilityList({ capabilities }) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return <p className="sans text-xs text-muted italic">No capabilities recorded.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {capabilities.map((capability) => (
        <span
          key={capability}
          className="sans text-[10px] text-secondary rounded border border-border-subtle px-1.5 py-0.5 bg-canvas/40"
        >
          {capability}
        </span>
      ))}
    </div>
  );
}

function ArtifactSchemaInspector({
  p,
  meta,
  fileDates,
  capabilities,
  artifactEdges,
  artifactEvents,
  detail,
  openSections,
  onToggleSection,
  canLinkFrom,
  clusterId,
  onOpenLink,
  onSelectPrimitive,
  onUnlink,
  labelForArtifact,
  labelForEdgeEndpoint,
}) {
  return (
    <>
      <CollapsibleSchemaSection
        title="Identity"
        open={openSections.identity}
        onToggle={() => onToggleSection('identity')}
      >
        <FieldRow label="ID" value={p.id} />
        <FieldRow label="Project" value={p.project_id} />
        <FieldRow label="Type" value={p.type} />
        <FieldRow label="Title" value={p.title} />
        <FieldRow label="Description" value={p.description} />
        <FieldRow label="URI" value={p.uri} />
        <FieldRow label="Source" value={p.source_authority} />
        <FieldRow label="Created by" value={p.created_by} />
        <FieldRow label="Updated by" value={p.updated_by} />
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Lifecycle"
        open={openSections.lifecycle}
        onToggle={() => onToggleSection('lifecycle')}
      >
        <FieldRow label="Created" value={formatArtifactDateTime(p.created_at)} />
        <FieldRow label="Updated" value={formatArtifactDateTime(p.updated_at)} />
        <FieldRow label="Retrieved" value={formatArtifactDateTime(p.retrieved_at)} />
        <FieldRow label="Archived" value={formatArtifactDateTime(p.archived_at)} />
        <FieldRow label="Schema version" value={p.schema_version} />
        <FieldRow label="Content schema version" value={p.content_schema_version} />
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="State"
        open={openSections.state}
        onToggle={() => onToggleSection('state')}
      >
        <FieldRow label="Current state" value={p.current_state_id} />
        <FieldRow label="State machine" value={p.state_machine_id} />
        {!p.current_state_id && !p.state_machine_id && (
          <p className="sans text-xs text-muted italic">No lifecycle state recorded.</p>
        )}
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Content"
        open={openSections.content}
        onToggle={() => onToggleSection('content')}
      >
        <FieldRow label="Hash" value={p.content_hash} />
        <FieldRow label="Version" value={p.version} />
        <FieldRow label="File" value={meta?.filename} />
        <FieldRow
          label={strings.modal.dateCreated}
          value={formatArtifactDateTime(fileDates?.dateCreated)}
        />
        {fileDates?.dateModified ? (
          <FieldRow
            label={strings.modal.dateModified}
            value={formatArtifactDateTime(fileDates.dateModified)}
          />
        ) : null}
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
          <FieldRow label="Connector" value={meta?.connectorLabel || meta?.connectorId} />
        )}
        {p.payload_text ? (
          <div className="pt-2">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">
              {p.type === 'agent_chat' ? 'Chat transcript' : strings.inspector.payloadPreview}
            </div>
            <TextBlock value={p.payload_text} />
          </div>
        ) : (
          <p className="sans text-xs text-muted italic">No text payload stored.</p>
        )}
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Capabilities"
        open={openSections.capabilities}
        onToggle={() => onToggleSection('capabilities')}
      >
        <CapabilityList capabilities={capabilities} />
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Metadata"
        open={openSections.metadata}
        onToggle={() => onToggleSection('metadata')}
      >
        <JsonBlock value={meta} />
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Relationships"
        open={openSections.relationships}
        onToggle={() => onToggleSection('relationships')}
      >
        {canLinkFrom && clusterId && (
          <button
            type="button"
            className="mb-2 sans text-xs text-link hover:text-link-hover hover:underline"
            onClick={onOpenLink}
          >
            {strings.linkArtifact.link}
          </button>
        )}
        {artifactEdges?.incoming?.length > 0 && (
          <div className="mb-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.graph.referencedBy}
            </div>
            <ul className="space-y-1">
              {artifactEdges.incoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="sans text-xs text-link hover:text-link-hover hover:underline text-left"
                    onClick={() => onSelectPrimitive?.({ id: e.from_id, type: e.from_type })}
                  >
                    {labelForArtifact(e.from_id)} → {e.type}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.edges?.length > 0 ? (
          <ul className="space-y-1">
            {detail.edges.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="text-left sans text-xs text-link hover:text-link-hover hover:underline flex-1"
                  onClick={() => {
                    const other =
                      e.from_id === p.id && e.from_type === 'artifact'
                        ? { id: e.to_id, type: e.to_type }
                        : { id: e.from_id, type: e.from_type };
                    onSelectPrimitive?.(other);
                  }}
                >
                  {e.type} {e.from_id === p.id ? '→' : '←'}{' '}
                  {e.from_id === p.id
                    ? labelForEdgeEndpoint(e, false)
                    : labelForEdgeEndpoint(e, true)}
                </button>
                {e.type !== 'note_attachment' && (
                  <button
                    type="button"
                    className="sans text-[10px] text-danger shrink-0"
                    onClick={() => void onUnlink(e.id)}
                  >
                    {strings.graph.unlink}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sans text-xs text-muted italic">No relationships recorded.</p>
        )}
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="History"
        open={openSections.history}
        onToggle={() => onToggleSection('history')}
      >
        {artifactEvents.length > 0 ? (
          <ul className="space-y-2">
            {artifactEvents.map((event) => (
              <li key={event.id} className="rounded border border-border-subtle bg-canvas/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="sans text-xs text-primary">{event.type}</span>
                  <span className="sans text-[10px] text-muted">
                    {formatArtifactDateTime(event.createdAt)}
                  </span>
                </div>
                <div className="sans text-[10px] text-muted mt-0.5">
                  {event.actorType}:{event.actorId}
                </div>
                <JsonBlock value={event.payload} maxHeight="max-h-36" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="sans text-xs text-muted italic">No artifact events recorded.</p>
        )}
      </CollapsibleSchemaSection>

      <CollapsibleSchemaSection
        title="Raw"
        open={openSections.raw}
        onToggle={() => onToggleSection('raw')}
      >
        <JsonBlock value={p} maxHeight="max-h-[32rem]" />
      </CollapsibleSchemaSection>
    </>
  );
}

export function PrimitiveInspectorPanel({
  variant = 'overlay',
  selection,
  clusterId,
  clusterInspectorReload = 0,
  cards = [],
  stagedSyncCards = [],
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
  const [artifactEvents, setArtifactEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [primitiveLabels, setPrimitiveLabels] = useState(() => new Map());
  const [schemaSectionsOpen, setSchemaSectionsOpen] = useState({
    identity: true,
    lifecycle: true,
    state: true,
    content: true,
    capabilities: true,
    metadata: true,
    relationships: true,
    history: true,
    raw: false,
  });

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
          const [edges, events] = await Promise.all([
            fetchArtifactEdges(selection.id),
            fetchArtifactEvents(selection.id, { limit: 50 }),
          ]);
          if (!cancelled) setArtifactEdges(edges);
          if (!cancelled) setArtifactEvents(events.events || []);
        } else if (!cancelled) {
          setArtifactEdges(null);
          setArtifactEvents([]);
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
    p?.metadata && typeof p.metadata === 'string'
      ? parseMaybeJson(p.metadata, {})
      : p?.metadata;
  const capabilities = Array.isArray(p?.capabilities) ? p.capabilities : [];
  const fileDates =
    selection.type === 'artifact'
      ? resolveArtifactFileDates(selection.id, { cards, stagedSyncCards, meta })
      : null;

  const toggleSchemaSection = (sectionId) => {
    setSchemaSectionsOpen((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

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
                    <ArtifactSchemaInspector
                      p={p}
                      meta={meta}
                      fileDates={fileDates}
                      capabilities={capabilities}
                      artifactEdges={artifactEdges}
                      artifactEvents={artifactEvents}
                      detail={detail}
                      openSections={schemaSectionsOpen}
                      onToggleSection={toggleSchemaSection}
                      canLinkFrom={canLinkFrom}
                      clusterId={clusterId}
                      onOpenLink={() => setLinkOpen(true)}
                      onSelectPrimitive={onSelectPrimitive}
                      onUnlink={handleUnlink}
                      labelForArtifact={labelForArtifact}
                      labelForEdgeEndpoint={labelForEdgeEndpoint}
                    />
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

                  {selection.type !== 'artifact' && detail.edges?.length > 0 && (
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

                  {selection.type !== 'artifact' && detail.provenance?.length > 0 && (
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
