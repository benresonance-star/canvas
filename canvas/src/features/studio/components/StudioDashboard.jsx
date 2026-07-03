import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Archive, ChevronRight, ExternalLink, GitBranch, Network, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react';
import {
  applyStudioPromotion,
  archiveStudio,
  createStudioCandidate,
  createStudioContextPacket,
  createStudioPromotion,
  fetchStudioOverview,
  invokeChildStudio,
  listStudioCandidates,
  listStudioPromotions,
  restoreStudio,
  updateStudio,
} from '../api/studioApi.js';
import { FlowEditor } from '../../flow/components/FlowEditor.jsx';
import { strings } from '../../../content/strings.js';

function flowCardForSurface(surface) {
  const flowId = surface?.artifactId ?? surface?.flow?.id;
  if (!flowId) return null;
  return {
    id: `studio-surface-${flowId}`,
    key: `flows__${flowId}`,
    prefix: 'flows',
    name: surface.title ?? surface.flow?.title ?? 'Studio Exploration',
    type: 'flow',
    versions: [{
      version: 1,
      artifactRef: { id: flowId, type: 'artifact' },
      flowId,
      inline: true,
      ext: 'flow',
      filename: surface.flow?.snapshotPath || `${surface.title ?? 'studio-exploration'}.flow.json`,
    }],
    pinnedVersion: 1,
  };
}

function pinnedVersionForCard(card) {
  return (card?.versions ?? []).find((version) => version.version === card?.pinnedVersion)
    ?? card?.versions?.[0]
    ?? null;
}

function studioIdForCard(card) {
  const pinned = pinnedVersionForCard(card);
  return card?.studioId ?? pinned?.studioId ?? pinned?.artifactRef?.id ?? null;
}

function shortDate(value) {
  if (!value) return 'unknown';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function StudioDashboard({
  card,
  artifactCandidates = [],
  folderHandle = null,
  projectId = null,
  onRehydratePreview = null,
  onEnsureStudioCard = null,
  onOpenStudioCard = null,
  onRemoveStudioCard = null,
}) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [activeSurfaceId, setActiveSurfaceId] = useState(null);
  const [candidateArtifactId, setCandidateArtifactId] = useState('');
  const [childCandidateRows, setChildCandidateRows] = useState([]);
  const [promotionRows, setPromotionRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [pendingPromotedArtifactId, setPendingPromotedArtifactId] = useState(null);
  const [pendingRevealStudioId, setPendingRevealStudioId] = useState(null);
  const [pendingRestoreStudio, setPendingRestoreStudio] = useState(null);
  const [showArchivedChildStudios, setShowArchivedChildStudios] = useState(false);
  const [archiveConfirmChild, setArchiveConfirmChild] = useState(null);
  const rootStudioId = studioIdForCard(card);

  useEffect(() => {
    let active = true;
    setError(null);
    if (!rootStudioId) {
      setOverview(null);
      setError('Studio reference is missing from this canvas card.');
      return () => { active = false; };
    }
    fetchStudioOverview(rootStudioId)
      .then((next) => {
        if (active) setOverview(next);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => { active = false; };
  }, [rootStudioId]);

  const studio = overview?.studio ?? {
    title: card.name,
    studioKind: card.studioKind,
    state: card.studioState,
    description: '',
    summary: card.studioSummary,
    parentStudioId: card.parentStudioId ?? null,
  };
  const parentStudio = overview?.parentStudio ?? (
    card.parentStudioId
      ? { id: card.parentStudioId, title: card.parentStudioTitle ?? 'Parent Studio' }
      : null
  );
  const isChildStudio = Boolean(studio.parentStudioId || card.parentStudioId);
  const surfaces = overview?.surfaces ?? card.studioSurfaces ?? [];
  const childStudios = overview?.childStudios ?? [];
  const archivedChildStudios = overview?.archivedChildStudios ?? [];
  const ownCandidates = overview?.placeholders?.candidates ?? [];
  const ownPromotions = overview?.placeholders?.promotions ?? [];
  const candidateCards = useMemo(() => artifactCandidates
    .filter((candidate) => !['studio', 'flow'].includes(candidate.type))
    .filter((candidate) => pinnedVersionForCard(candidate)?.artifactRef?.id),
  [artifactCandidates]);

  useEffect(() => {
    let active = true;
    if (!childStudios.length) {
      setChildCandidateRows([]);
      return () => { active = false; };
    }
    Promise.all(childStudios.map(async (child) => {
      const candidates = await listStudioCandidates(child.id).catch(() => []);
      return candidates.map((candidate) => ({ ...candidate, childStudioId: child.id, childStudioTitle: child.title }));
    })).then((groups) => {
      if (active) setChildCandidateRows(groups.flat());
    });
    return () => { active = false; };
  }, [childStudios]);

  const primary = surfaces.find((surface) => surface.isPrimary) ?? surfaces[0] ?? null;
  const activeStudioId = studio.id ?? rootStudioId;
  const counts = overview?.counts ?? card.studioCounts ?? {};
  const activeSurface = activeSurfaceId
    ? surfaces.find((surface) => surface.id === activeSurfaceId || surface.artifactId === activeSurfaceId)
    : null;
  const activeFlowCard = flowCardForSurface(activeSurface);
  const ensureChildCardPosition = () => ({
    x: (card.x ?? 100) + 420,
    y: (card.y ?? 100) + Math.max(0, childStudios.length - 1) * 280,
  });
  const refreshOverview = async () => {
    if (!activeStudioId) return null;
    const next = await fetchStudioOverview(activeStudioId);
    setOverview(next);
    return next;
  };

  const refreshPromotionRows = async () => {
    if (!activeStudioId) return [];
    const rows = await listStudioPromotions(activeStudioId);
    setPromotionRows(rows);
    return rows;
  };
  useEffect(() => {
    if (activeStudioId) void refreshPromotionRows().catch((err) => setError(err.message));
  }, [activeStudioId]);
  const handleCreateContextPacket = async (payload) => {
    if (!activeStudioId) return null;
    const contextPacket = await createStudioContextPacket(activeStudioId, payload);
    await refreshOverview();
    return contextPacket;
  };
  const handleInvokeChildStudio = async (payload) => {
    if (!activeStudioId) return null;
    const result = await invokeChildStudio(activeStudioId, payload);
    const parentOverview = result.parentOverview ?? await fetchStudioOverview(activeStudioId);
    setOverview(parentOverview);
    const childOverview = result.childOverview
      ?? (result.childStudio?.id ? await fetchStudioOverview(result.childStudio.id) : null);
    let childCard = null;
    if (childOverview && onEnsureStudioCard) {
      childCard = await onEnsureStudioCard(childOverview, {
        position: ensureChildCardPosition(),
        parentStudioTitle: studio.title,
        open: false,
        reason: 'studio:child-create',
      });
    }
    return { ...result, childOverview, childCard };
  };
  const ensureStudioCardProjection = async (studioOverview, parentTitle = null) => {
    const targetStudioId = studioOverview?.studio?.id;
    if (!targetStudioId) return null;
    if (!onEnsureStudioCard) return null;
    return onEnsureStudioCard(studioOverview, {
      parentStudioTitle: parentTitle,
      open: false,
      reason: 'studio:open-related',
    });
  };
  const enterStudioOverview = async (studioOverview, { openPrimary = false, recoverCard = true } = {}) => {
    if (!studioOverview?.studio?.id) return null;
    setError(null);
    setOverview(studioOverview);
    const nextSurfaces = studioOverview.surfaces ?? [];
    const nextPrimary = nextSurfaces.find((surface) => surface.isPrimary) ?? nextSurfaces[0] ?? null;
    setActiveSurfaceId(openPrimary && nextPrimary ? nextPrimary.id : null);
    if (recoverCard) {
      void ensureStudioCardProjection(studioOverview, studio.title).catch((err) => setError(err.message));
    }
    return studioOverview;
  };
  const handleOpenChildStudio = async (child) => {
    try {
      const childOverview = await fetchStudioOverview(child.id);
      await enterStudioOverview(childOverview, { openPrimary: false });
    } catch (err) {
      setError(err.message);
    }
  };
  const handleOpenParentStudio = async () => {
    const parentId = parentStudio?.id ?? studio.parentStudioId ?? card.parentStudioId;
    if (!parentId) return;
    try {
      const parentOverview = await fetchStudioOverview(parentId);
      await enterStudioOverview(parentOverview, { openPrimary: false, recoverCard: false });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenStudioFromFlow = async (targetStudioId, options = {}) => {
    if (!targetStudioId) return null;
    try {
      const targetOverview = await fetchStudioOverview(targetStudioId);
      return enterStudioOverview(targetOverview, {
        openPrimary: options.openPrimary !== false,
        recoverCard: true,
      });
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const handleRenameStudio = async (target) => {
    const title = window.prompt('Rename Studio', target.title);
    if (!title?.trim() || title.trim() === target.title) return;
    setBusyId(target.id);
    try {
      await updateStudio(target.id, { title: title.trim() });
      const targetOverview = await fetchStudioOverview(target.id);
      await onEnsureStudioCard?.(targetOverview, {
        parentStudioTitle: studio.title,
        open: false,
        reason: 'studio:rename',
      });
      await refreshOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleArchiveChildStudio = async (child) => {
    setBusyId(child.id);
    try {
      await archiveStudio(child.id, { reason: 'Archived from parent Studio dashboard' });
      await onRemoveStudioCard?.(child.id);
      await refreshOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setArchiveConfirmChild(null);
    }
  };

  const handleRestoreChildStudio = async (child) => {
    setBusyId(child.id);
    try {
      await restoreStudio(child.id, { reason: 'Restored from parent Studio dashboard' });
      const childOverview = await fetchStudioOverview(child.id);
      let childCard = null;
      if (childOverview && onEnsureStudioCard) {
        childCard = await onEnsureStudioCard(childOverview, {
          position: ensureChildCardPosition(),
          parentStudioTitle: studio.title,
          open: false,
          reason: 'studio:child-restore',
        });
      }
      if (primary?.id) {
        setPendingRestoreStudio({
          studioId: child.id,
          childCard,
          childOverview,
        });
        setActiveSurfaceId(primary.id);
      }
      await refreshOverview();
    } catch (err) {
      setError(err.message || strings.flow.restoreChildStudioFailed);
    } finally {
      setBusyId(null);
    }
  };

  const handleRenameStudioNode = async (targetStudioId, title) => {
    await updateStudio(targetStudioId, { title });
    const targetOverview = await fetchStudioOverview(targetStudioId);
    await onEnsureStudioCard?.(targetOverview, {
      parentStudioTitle: studio.title,
      open: false,
      reason: 'studio:node-rename',
    });
    await refreshOverview();
  };

  const handleArchiveStudioNode = async (targetStudioId) => {
    await archiveStudio(targetStudioId, { reason: 'Archived from parent Exploration' });
    await onRemoveStudioCard?.(targetStudioId);
    await refreshOverview();
  };

  const handleRevealChildStudio = async (child) => {
    try {
      const childOverview = await fetchStudioOverview(child.id);
      let childCard = null;
      if (childOverview && onEnsureStudioCard) {
        childCard = await onEnsureStudioCard(childOverview, {
          parentStudioTitle: studio.title,
          open: false,
          reason: 'studio:reveal-node',
        });
      }
      if (primary?.id) {
        setPendingRestoreStudio({
          studioId: child.id,
          childCard,
          childOverview,
        });
        setActiveSurfaceId(primary.id);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateCandidate = async () => {
    if (!activeStudioId || !candidateArtifactId) return;
    setBusyId('candidate:create');
    try {
      await createStudioCandidate(activeStudioId, {
        underlyingArtifactId: candidateArtifactId,
        status: 'under_review',
      });
      setCandidateArtifactId('');
      await refreshOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handlePromoteCandidate = async (candidate) => {
    const sourceStudioId = candidate.childStudioId ?? candidate.studioId;
    if (!sourceStudioId || !activeStudioId) return;
    setBusyId(candidate.id);
    try {
      const promotion = await createStudioPromotion(sourceStudioId, {
        candidateArtifactId: candidate.id,
        targetStudioId: activeStudioId,
        action: 'attach_as_reference',
      });
      const applied = await applyStudioPromotion(promotion.id, { approvedBy: 'user' });
      const promotedArtifactId = applied.candidateUnderlyingArtifactId ?? candidate.underlyingArtifactId;
      if (promotedArtifactId && primary?.id) {
        setPendingPromotedArtifactId(promotedArtifactId);
        setActiveSurfaceId(primary.id);
      }
      await refreshPromotionRows();
      await refreshOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (activeFlowCard) {
    return (
      <div className="h-full min-h-0 bg-canvas text-primary flex flex-col">
        <header className="h-14 shrink-0 border-b border-border bg-surface px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSurfaceId(null)}
            className="p-2 text-muted hover:text-primary"
            aria-label="Back to Studio"
            title="Back to Studio"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">
              {isChildStudio ? 'Child Studio Surface' : 'Studio surface'}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              {isChildStudio && parentStudio && (
                <>
                  <button
                    type="button"
                    onClick={() => { void handleOpenParentStudio(); }}
                    className="serif max-w-[16rem] truncate text-sm text-secondary hover:text-primary"
                    title={`Open ${parentStudio.title}`}
                  >
                    {parentStudio.title}
                  </button>
                  <ChevronRight size={13} className="shrink-0 text-muted" />
                </>
              )}
              <button
                type="button"
                onClick={() => setActiveSurfaceId(null)}
                className="serif max-w-[18rem] truncate text-sm text-primary hover:text-accent"
                title={`Open ${studio.title} dashboard`}
              >
                {studio.title}
              </button>
              <ChevronRight size={13} className="shrink-0 text-muted" />
              <span className="serif min-w-0 truncate text-sm text-primary" title={activeSurface.title}>
                {activeSurface.title}
              </span>
            </div>
          </div>
          {isChildStudio && parentStudio && (
            <button
              type="button"
              onClick={() => { void handleOpenParentStudio(); }}
              className="sans shrink-0 rounded-full border border-border bg-canvas px-3 py-1.5 text-[10px] text-secondary hover:border-accent hover:text-primary transition"
            >
              Parent Studio
            </button>
          )}
        </header>
        <div className="flex-1 min-h-0">
          <FlowEditor
            card={activeFlowCard}
            artifactCandidates={artifactCandidates}
            folderHandle={folderHandle}
            projectId={projectId}
            onRehydratePreview={onRehydratePreview}
            studioContext={{
              studioId: activeStudioId,
              studioTitle: studio.title,
              surfaceId: activeSurface.id,
              surfaceTitle: activeSurface.title,
            }}
            onCreateStudioContextPacket={handleCreateContextPacket}
            onInvokeChildStudio={handleInvokeChildStudio}
            onOpenStudioCard={handleOpenStudioFromFlow}
            onRenameStudioNode={handleRenameStudioNode}
            onArchiveStudioNode={handleArchiveStudioNode}
            pendingRevealStudioId={pendingRevealStudioId}
            onStudioNodeRevealed={() => setPendingRevealStudioId(null)}
            pendingRestoreStudio={pendingRestoreStudio}
            onRestoreStudioComplete={() => setPendingRestoreStudio(null)}
            pendingPromotedArtifactId={pendingPromotedArtifactId}
            onPromotedArtifactProjected={() => setPendingPromotedArtifactId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-canvas text-primary flex flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-5 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md border border-accent-border bg-accent-muted text-accent flex items-center justify-center">
          <Network size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="sans text-[10px] uppercase tracking-wider text-muted">
            {isChildStudio ? 'child studio' : `${studio.studioKind ?? 'domain'} studio`} / {studio.state ?? 'seeded'}
          </div>
          {isChildStudio && parentStudio ? (
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => { void handleOpenParentStudio(); }}
                className="serif max-w-[22rem] truncate text-2xl text-secondary hover:text-primary"
                title={`Open ${parentStudio.title}`}
              >
                {parentStudio.title}
              </button>
              <ChevronRight size={17} className="shrink-0 text-muted" />
              <h2 className="serif min-w-0 truncate text-2xl text-primary" title={studio.title}>{studio.title}</h2>
            </div>
          ) : (
            <h2 className="serif text-2xl text-primary truncate" title={studio.title}>{studio.title}</h2>
          )}
          {isChildStudio && parentStudio && (
            <div className="mt-2 inline-flex rounded-full border border-border bg-canvas p-0.5 sans text-[10px]">
              <button
                type="button"
                onClick={() => { void handleOpenParentStudio(); }}
                className="rounded-full px-2.5 py-1 text-secondary hover:text-primary"
              >
                Parent: {parentStudio.title}
              </button>
              <span className="rounded-full bg-accent-muted px-2.5 py-1 text-accent">Child Studio</span>
            </div>
          )}
          <p className="sans text-xs text-secondary mt-1 line-clamp-2">{studio.description || studio.summary || 'No brief recorded yet.'}</p>
        </div>
        {primary?.flow?.id || primary?.artifactId ? (
          <button
            type="button"
            onClick={() => setActiveSurfaceId(primary.id)}
            className="sans shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs hover:border-accent transition"
          >
            <ExternalLink size={13} />
            Open primary Exploration
          </button>
        ) : null}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {error && <div className="sans text-xs rounded-md border border-danger-border bg-danger-muted text-danger px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Surfaces', surfaces.length],
            ['Runs', counts.runs ?? 0],
            ['Candidates', counts.candidates ?? 0],
            ['Promotion queue', counts.promotions ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3">
              <div className="sans text-[10px] uppercase tracking-wider text-muted">{label}</div>
              <div className="serif text-2xl mt-1">{value}</div>
            </div>
          ))}
        </div>
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">Exploration surfaces</div>
            <button type="button" className="sans inline-flex items-center gap-1 text-[10px] text-muted cursor-default">
              <Plus size={12} /> Add surface later
            </button>
          </div>
          <div className="space-y-2">
            {surfaces.map((surface) => (
              <button
                key={surface.id}
                type="button"
                onClick={() => setActiveSurfaceId(surface.id)}
                className="w-full text-left rounded-md border border-border bg-canvas px-3 py-2 hover:border-accent transition"
              >
                <div className="flex items-center gap-2">
                  <GitBranch size={13} className="text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="sans text-sm text-primary truncate">{surface.title}</div>
                    <div className="sans text-[10px] text-muted truncate">{surface.purpose || surface.surfaceType}</div>
                  </div>
                  {surface.isPrimary && <span className="sans text-[9px] uppercase tracking-wider text-accent">Primary</span>}
                </div>
              </button>
            ))}
            {!surfaces.length && <p className="sans text-xs text-muted">No exploration surfaces yet.</p>}
          </div>
        </section>
        <div className="grid md:grid-cols-3 gap-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="sans text-[10px] uppercase tracking-wider text-muted">Child studios</div>
              <button
                type="button"
                onClick={() => setShowArchivedChildStudios((open) => !open)}
                className="sans rounded-full border border-border px-2 py-1 text-[10px] text-secondary hover:text-primary"
              >
                {showArchivedChildStudios ? strings.flow.hideArchives : strings.flow.revealArchives}
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {childStudios.map((child) => (
                <div
                  key={child.id}
                  className="rounded-md border border-border bg-canvas px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => { void handleOpenChildStudio(child); }}
                    className="block w-full text-left"
                  >
                    <div className="sans text-sm text-primary truncate">{child.title}</div>
                    <div className="sans text-[10px] uppercase tracking-wider text-muted">
                      {child.studioKind} / {child.state} / updated {shortDate(child.updatedAt)}
                    </div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => { void handleOpenChildStudio(child); }} className="sans rounded-full border border-border px-2 py-1 text-[10px] text-secondary hover:text-primary">Open</button>
                    <button type="button" onClick={() => { void handleRevealChildStudio(child); }} className="sans rounded-full border border-border px-2 py-1 text-[10px] text-secondary hover:text-primary">Reveal node</button>
                    <button type="button" onClick={() => { void handleRenameStudio(child); }} disabled={busyId === child.id} className="sans inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-secondary hover:text-primary disabled:opacity-40">
                      <Pencil size={10} /> Rename
                    </button>
                    <button type="button" onClick={() => setArchiveConfirmChild(child)} disabled={busyId === child.id} className="sans inline-flex items-center gap-1 rounded-full border border-danger-border px-2 py-1 text-[10px] text-danger hover:bg-danger-muted disabled:opacity-40">
                      <Archive size={10} /> Archive
                    </button>
                  </div>
                </div>
              ))}
              {!childStudios.length && (
                <p className="sans text-xs text-secondary">Create one from a selected Exploration path.</p>
              )}
              {showArchivedChildStudios && (
                <div className="mt-3 border-t border-border pt-3 space-y-2">
                  {archivedChildStudios.map((child) => (
                    <div
                      key={child.id}
                      className="rounded-md border border-border bg-canvas px-3 py-2 opacity-90"
                    >
                      <div className="sans text-sm text-primary truncate">{child.title}</div>
                      <div className="sans text-[10px] uppercase tracking-wider text-muted">
                        archived {shortDate(child.archivedAt)} / {child.state}
                        {child.archiveReason ? ` / ${child.archiveReason}` : ''}
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => { void handleRestoreChildStudio(child); }}
                          disabled={busyId === child.id}
                          className="sans inline-flex items-center gap-1 rounded-full border border-accent-border px-2 py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
                        >
                          <RotateCcw size={10} /> {strings.flow.restoreChildStudio}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!archivedChildStudios.length && (
                    <p className="sans text-xs text-muted">{strings.flow.archivedChildStudiosEmpty}</p>
                  )}
                </div>
              )}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">Candidate artifacts</div>
            {isChildStudio ? (
              <div className="mt-3 space-y-2">
                <select
                  value={candidateArtifactId}
                  onChange={(event) => setCandidateArtifactId(event.target.value)}
                  className="sans w-full rounded-md border border-border bg-canvas px-2 py-2 text-xs"
                >
                  <option value="">Select artifact to mark as candidate</option>
                  {candidateCards.map((candidate) => (
                    <option key={candidate.id} value={pinnedVersionForCard(candidate)?.artifactRef?.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!candidateArtifactId || busyId === 'candidate:create'}
                  onClick={() => { void handleCreateCandidate(); }}
                  className="sans rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:text-primary disabled:opacity-40"
                >
                  Mark candidate
                </button>
                {ownCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-md border border-border bg-canvas px-3 py-2">
                    <div className="sans text-sm text-primary truncate">{candidate.artifactTitle ?? candidate.underlyingArtifactId}</div>
                    <div className="sans text-[10px] uppercase tracking-wider text-muted">{candidate.status}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {childCandidateRows.map((candidate) => (
                  <div key={candidate.id} className="rounded-md border border-border bg-canvas px-3 py-2">
                    <div className="sans text-sm text-primary truncate">{candidate.artifactTitle ?? candidate.underlyingArtifactId}</div>
                    <div className="sans text-[10px] uppercase tracking-wider text-muted">
                      {candidate.childStudioTitle} / {candidate.status}
                    </div>
                    <button
                      type="button"
                      disabled={busyId === candidate.id}
                      onClick={() => { void handlePromoteCandidate(candidate); }}
                      className="sans mt-2 rounded-full border border-accent-border px-2 py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
                    >
                      Promote to parent
                    </button>
                  </div>
                ))}
                {!childCandidateRows.length && (
                  <p className="sans text-xs text-secondary">Approved child outputs will appear here before promotion.</p>
                )}
              </div>
            )}
          </section>
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">Promotion queue</div>
            <div className="mt-2 space-y-2">
              {[...ownPromotions, ...promotionRows].map((promotion) => (
                <div key={promotion.id} className="rounded-md border border-border bg-canvas px-3 py-2">
                  <div className="sans text-sm text-primary truncate">{promotion.candidateTitle ?? promotion.candidateArtifactId}</div>
                  <div className="sans text-[10px] uppercase tracking-wider text-muted">
                    {promotion.action} / {promotion.status}
                  </div>
                </div>
              ))}
              {![...ownPromotions, ...promotionRows].length && (
                <p className="sans text-xs text-secondary">Review-required promotion decisions will be applied from this queue.</p>
              )}
            </div>
          </section>
        </div>
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 sans text-[10px] uppercase tracking-wider text-muted">
            <Sparkles size={13} className="text-accent" />
            Playbook
          </div>
          <div className="serif text-lg mt-2">{overview?.playbook?.title ?? 'Generic Domain Studio'}</div>
          <p className="sans text-xs text-secondary mt-1">{overview?.playbook?.description ?? 'A reusable bounded exploration studio.'}</p>
        </section>
      </div>
      {archiveConfirmChild && (
        <div
          className="fixed inset-0 z-[60] bg-[var(--color-overlay-dialog)] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setArchiveConfirmChild(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-child-studio-title"
            className="bg-surface rounded-lg w-full max-w-sm overflow-hidden shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-border">
              <div id="archive-child-studio-title" className="serif text-lg text-primary">
                {strings.flow.archiveChildStudioTitle}
              </div>
              <p className="sans text-sm text-secondary mt-2">
                {strings.flow.archiveChildStudioBody(archiveConfirmChild.title)}
              </p>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-2 bg-surface-muted">
              <button
                type="button"
                onClick={() => setArchiveConfirmChild(null)}
                className="sans text-xs text-secondary hover:text-primary px-3 py-2 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === archiveConfirmChild.id}
                onClick={() => { void handleArchiveChildStudio(archiveConfirmChild); }}
                className="sans text-xs bg-danger-muted text-danger border border-danger-border px-4 py-2 rounded transition hover:opacity-90 disabled:opacity-40"
              >
                {strings.flow.archiveChildStudioConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
