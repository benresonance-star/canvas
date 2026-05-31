import React, { useEffect, useMemo, useState } from 'react';
import { strings } from '../content/strings.js';
import {
  getPrimitiveDetail,
  removeClusterMember,
  addClusterMembers,
  deleteSubCluster,
  updateCluster,
} from '../lib/primitivesApi.js';
import { buildArtifactToCardMap } from '../lib/graph/clusterGraph.js';
import {
  artifactMembersFromCards,
  clusterSelectionStatsFromCards,
  isClusterMemberHighlighted,
} from '../lib/clusterMembers.js';

function FieldRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      <div className="sans text-xs text-secondary break-all">{String(value)}</div>
    </div>
  );
}

function ClusterNameField({ value, onSave, disabled, saving }) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value ?? '');
      return;
    }
    try {
      await onSave(trimmed);
    } catch {
      setDraft(value ?? '');
    }
  };

  return (
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-0.5">
        {strings.cluster.name}
      </div>
      <input
        type="text"
        value={draft}
        disabled={disabled || saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value ?? '');
            e.currentTarget.blur();
          }
        }}
        className="w-full sans text-xs bg-surface border border-border rounded px-2 py-1.5 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
      />
      {saving && (
        <p className="sans text-[10px] text-muted mt-0.5">{strings.cluster.nameSaving}</p>
      )}
    </div>
  );
}

export function ClusterManagementSection({
  clusterId,
  cards = [],
  selectedCardIds,
  activeCardId = null,
  agentChatThreadIndex = null,
  singleConnectorId = null,
  reloadKey = 0,
  onGraphRefresh,
  onClusterRenamed,
  onClusterDeleted,
  onSelectPrimitive,
  onOpenCardKey,
  onViewArtifact,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingMembers, setAddingMembers] = useState(false);
  const [deletingCluster, setDeletingCluster] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [localReload, setLocalReload] = useState(0);
  const [savingName, setSavingName] = useState(false);

  const artifactMap = useMemo(() => buildArtifactToCardMap(cards), [cards]);

  const clusterMemberOptions = useMemo(
    () => ({
      threads: agentChatThreadIndex?.threads ?? [],
      connectorId: singleConnectorId ?? '',
    }),
    [agentChatThreadIndex?.threads, singleConnectorId],
  );

  const labelForArtifact = (artifactId) => {
    const hit = artifactMap.get(artifactId);
    return hit ? `${hit.name} (${hit.cardKey})` : `${artifactId.slice(0, 12)}…`;
  };

  useEffect(() => {
    if (!clusterId) {
      setDetail(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPrimitiveDetail('cluster', clusterId);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clusterId, reloadKey, localReload]);

  const selectionStats = useMemo(() => {
    if (!selectedCardIds?.size) return { selected: 0, syncable: 0 };
    const selected = cards.filter((c) => selectedCardIds.has(c.id));
    return clusterSelectionStatsFromCards(selected, clusterMemberOptions);
  }, [cards, selectedCardIds, clusterMemberOptions]);

  const p = detail?.primitive;
  const isSubCluster = Boolean(p?.parent_cluster_id);

  const bumpReload = () => {
    setLocalReload((k) => k + 1);
    onGraphRefresh?.();
  };

  const handleRenameCluster = async (name) => {
    if (!clusterId) return;
    setSavingName(true);
    setError(null);
    try {
      await updateCluster(clusterId, { name });
      setDetail((prev) =>
        prev?.primitive
          ? { ...prev, primitive: { ...prev.primitive, name } }
          : prev,
      );
      onClusterRenamed?.(clusterId, name);
      setLocalReload((k) => k + 1);
      await onGraphRefresh?.();
    } catch (e) {
      const msg = String(e.message || '');
      setError(
        msg.includes('npm run server')
          ? strings.cluster.renameApiUnavailable
          : msg || strings.cluster.renameFailed,
      );
      throw e;
    } finally {
      setSavingName(false);
    }
  };

  const handleRemoveClusterMember = async (member) => {
    if (!clusterId) return;
    try {
      await removeClusterMember(clusterId, {
        id: member.id,
        type: member.type || 'artifact',
      });
      bumpReload();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAddSelectionToCluster = async () => {
    if (!clusterId || !isSubCluster) return;
    const selected = cards.filter((c) => selectedCardIds?.has(c.id));
    const members = artifactMembersFromCards(selected, clusterMemberOptions);
    if (members.length === 0) {
      setError(strings.cluster.noArtifactsSelected);
      return;
    }
    setAddingMembers(true);
    setError(null);
    try {
      await addClusterMembers(clusterId, members);
      bumpReload();
    } catch (e) {
      setError(e.message || strings.cluster.addMembersFailed);
    } finally {
      setAddingMembers(false);
    }
  };

  const handleDeleteCluster = async () => {
    if (!clusterId) return;
    setDeletingCluster(true);
    setError(null);
    try {
      await deleteSubCluster(clusterId);
      setDeleteConfirmOpen(false);
      onGraphRefresh?.();
      onClusterDeleted?.();
    } catch (e) {
      setError(e.message || strings.cluster.deleteFailed);
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingCluster(false);
    }
  };

  const handleMemberPrimaryClick = (m) => {
    if (m.cardKey && onOpenCardKey) {
      onOpenCardKey(m.cardKey);
      return;
    }
    onViewArtifact?.({ type: 'artifact', id: m.id });
  };

  if (!clusterId) return null;

  return (
    <section>
      {loading && (
        <p className="sans text-xs text-muted italic">{strings.inspector.loading}</p>
      )}
      {error && <p className="sans text-xs text-danger">{error}</p>}

      {!loading && p && (
        <>
          <ClusterNameField
            value={p.name}
            onSave={handleRenameCluster}
            saving={savingName}
          />
          <FieldRow label="Status" value={p.status} />
          {p.purpose && <FieldRow label={strings.cluster.purpose} value={p.purpose} />}
          {p.parent_cluster_id && (
            <div className="py-1">
              <button
                type="button"
                className="sans text-xs text-link hover:text-link-hover hover:underline"
                onClick={() =>
                  onSelectPrimitive?.({ type: 'cluster', id: p.parent_cluster_id })
                }
              >
                {strings.cluster.viewParent}
              </button>
            </div>
          )}
          {isSubCluster && selectedCardIds?.size > 0 && (
            <div className="mt-2">
              <p className="sans text-[10px] text-muted mb-1.5">
                {strings.cluster.selectionSummary(
                  selectionStats.selected,
                  selectionStats.syncable,
                )}
              </p>
              <button
                type="button"
                disabled={addingMembers || selectionStats.syncable < 1}
                className="sans text-xs px-3 py-1.5 rounded border border-border bg-surface-muted text-primary hover:bg-surface disabled:opacity-50"
                onClick={() => void handleAddSelectionToCluster()}
              >
                {addingMembers
                  ? strings.cluster.addingMembers
                  : strings.cluster.addSelection}
              </button>
            </div>
          )}
          {isSubCluster && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              {!deleteConfirmOpen ? (
                <button
                  type="button"
                  className="sans text-xs text-danger hover:text-accent-hover hover:underline"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  {strings.cluster.deleteCluster}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="sans text-xs text-secondary">
                    {strings.cluster.deleteClusterConfirm}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deletingCluster}
                      className="sans text-xs px-3 py-1.5 rounded bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-50"
                      onClick={() => void handleDeleteCluster()}
                    >
                      {deletingCluster
                        ? strings.cluster.deleting
                        : strings.cluster.deleteCluster}
                    </button>
                    <button
                      type="button"
                      disabled={deletingCluster}
                      className="sans text-xs px-3 py-1.5 rounded border border-border text-muted hover:text-primary"
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.cluster.members}
            </div>
            {detail.members?.length > 0 ? (
              <ul className="space-y-1.5">
                {detail.members.map((m) => {
                  const highlighted = isClusterMemberHighlighted(
                    m,
                    artifactMap,
                    cards,
                    activeCardId,
                    selectedCardIds,
                  );
                  return (
                  <li
                    key={m.id}
                    aria-current={highlighted ? 'true' : undefined}
                    className={`flex items-start justify-between gap-2 sans text-xs rounded-md px-2 py-1.5 -mx-2 ${
                      highlighted ? 'inspector-member-highlight' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="text-link hover:text-link-hover hover:underline text-left break-all"
                        onClick={() => handleMemberPrimaryClick(m)}
                      >
                        {m.label || labelForArtifact(m.id)}
                      </button>
                      {m.cardKey && onOpenCardKey && (
                        <button
                          type="button"
                          className="block text-[10px] text-muted hover:text-link mt-0.5"
                          onClick={() => onOpenCardKey(m.cardKey)}
                        >
                          {strings.inspector.openOnCanvas}
                        </button>
                      )}
                      {onViewArtifact && (
                        <button
                          type="button"
                          className="block text-[10px] text-muted hover:text-link mt-0.5"
                          onClick={() => onViewArtifact({ type: 'artifact', id: m.id })}
                        >
                          {strings.cluster.viewArtifactDetails}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-danger shrink-0 hover:text-accent-hover hover:underline"
                      onClick={() => void handleRemoveClusterMember(m)}
                    >
                      {strings.cluster.removeMember}
                    </button>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="sans text-xs text-muted italic">{strings.inspector.empty}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
