import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Play, Settings2, Waypoints } from 'lucide-react';
import { MarkdownMessage } from '../../../components/MarkdownMessage.jsx';
import { ensureWritePermission, writeTextFileToFolder } from '../../../lib/folderWrite.js';
import { subscribeEventSource } from '../../../lib/eventSourceHub.js';
import { fetchCanvasProjectDocument } from '../../../lib/canvasProjectsApi.js';
import { cardTypeLabel } from '../../../lib/filename.js';
import {
  addLiveSource, deleteLiveSource, fetchLiveArtifact, fetchLiveHistory,
  fetchLiveModelOptions, fetchLiveSources, liveProjectStreamUrl, markLiveExported,
  runLiveArtifact, updateLiveArtifact, updateLiveSource,
} from '../api/liveApi.js';
import { formatLiveLastUpdated } from '../domain/liveArtifact.js';

const CANVAS_SOURCE_CARD_TYPES = new Set([
  'bookmark', 'user_note', 'user_task', 'code', 'markdown', 'note', 'file', 'pdf',
]);

function formatMirror(live) {
  const version = live.latestVersion;
  if (!version) return '';
  return [
    '---', 'canvas_kind: live', `live_kind: ${live.kind}`, `live_artifact_id: ${live.id}`,
    `project_id: ${live.projectId}`, `report_version: ${version.versionNumber}`,
    `model: ${version.model}`, `reasoning_effort: ${version.reasoningEffort || 'default'}`,
    `updated_at: ${version.createdAt}`, '---', '', version.markdownBody, '',
  ].join('\n');
}

function pinnedArtifactRef(card) {
  const pinned = card.versions?.find((v) => v.version === card.pinnedVersion) || card.versions?.[0];
  return pinned?.artifactRef ?? null;
}

function sourceTypeLabel(sourceType) {
  switch (sourceType) {
    case 'previous_version': return 'Previous version';
    case 'manual_text': return 'Manual text';
    case 'project_assumptions': return 'Assumptions';
    case 'canvas_artifact': return 'Canvas card';
    case 'canvas_note': return 'Canvas note';
    default: return sourceType;
  }
}

function canvasCardForSource(source, canvasCards) {
  if (source.sourceType !== 'canvas_artifact' || !source.sourceId) return null;
  return canvasCards.find((card) => pinnedArtifactRef(card)?.id === source.sourceId) ?? null;
}

function sourceHasResolvableContent(source, canvasCards) {
  if (!source.isEnabled) return true;
  if (source.sourceType === 'previous_version') return true;
  if (source.sourceType === 'manual_text' || source.sourceType === 'project_assumptions') {
    return Boolean(source.manualText?.trim());
  }
  if (source.sourceType === 'canvas_artifact') {
    const card = canvasCardForSource(source, canvasCards);
    if (card?.type === 'bookmark') return true;
    return Boolean(source.sourceId);
  }
  return Boolean(source.sourceId);
}

const actionClass = 'inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[9px] text-secondary hover:text-primary hover:bg-surface-muted disabled:opacity-50';
const inputClass = 'rounded border border-border bg-surface-muted px-2 py-1 text-primary';
const sourceTextareaClass = 'w-full border border-border bg-surface-muted rounded p-2 text-[10px] min-h-48 resize-y';

export function LiveArtifactView({ liveArtifactId, projectId, folderHandle = null, compact = false }) {
  const [live, setLive] = useState(null);
  const [panel, setPanel] = useState(null);
  const [history, setHistory] = useState([]);
  const [sources, setSources] = useState([]);
  const [canvasCards, setCanvasCards] = useState([]);
  const [models, setModels] = useState([]);
  const [manualLabel, setManualLabel] = useState('Seed context');
  const [manualText, setManualText] = useState('');
  const [canvasSourceId, setCanvasSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => setLive(await fetchLiveArtifact(liveArtifactId)), [liveArtifactId]);

  useEffect(() => { void refresh().catch((e) => setError(e.message)); }, [refresh]);

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return undefined;
    const onUpdate = (event) => {
      const data = JSON.parse(event.data || '{}');
      if (data.liveArtifactId === liveArtifactId) void refresh();
    };
    return subscribeEventSource(liveProjectStreamUrl(projectId), 'live_updated', onUpdate);
  }, [liveArtifactId, projectId, refresh]);

  useEffect(() => {
    const version = live?.latestVersion;
    if (!folderHandle || !version || live.folderExportStatus !== 'pending') return;
    void (async () => {
      if (!await ensureWritePermission(folderHandle)) return;
      await writeTextFileToFolder(folderHandle, live.exportFilename, formatMirror(live));
      const next = await markLiveExported(live.id, version.id);
      setLive((current) => ({ ...current, ...next }));
    })().catch(() => {});
  }, [folderHandle, live]);

  const loadCanvasCards = useCallback(async () => {
    if (!projectId) {
      setCanvasCards([]);
      return;
    }
    try {
      const doc = await fetchCanvasProjectDocument(projectId);
      setCanvasCards(doc?.payload?.cards ?? []);
    } catch {
      setCanvasCards([]);
    }
  }, [projectId]);

  const canvasSourceOptions = useMemo(() => {
    const linkedIds = new Set(
      sources
        .filter((source) => source.sourceType === 'canvas_artifact' && source.sourceId)
        .map((source) => source.sourceId),
    );
    return canvasCards
      .filter((card) => CANVAS_SOURCE_CARD_TYPES.has(card.type) && card.type !== 'live')
      .map((card) => {
        const artifactRef = pinnedArtifactRef(card);
        if (!artifactRef?.id || linkedIds.has(artifactRef.id)) return null;
        const bookmarkUrl = card.versions?.[0]?.externalUrl
          || card.versions?.[0]?.bookmarkPreview?.domain
          || null;
        return {
          cardId: card.id,
          artifactId: artifactRef.id,
          label: card.name,
          type: card.type,
          detail: bookmarkUrl || card.key,
        };
      })
      .filter(Boolean);
  }, [canvasCards, sources]);

  const enabledSourcesEmpty = useMemo(() => {
    const enabled = sources.filter((source) => source.isEnabled);
    if (!enabled.length) return true;
    return enabled.every((source) => !sourceHasResolvableContent(source, canvasCards));
  }, [sources, canvasCards]);

  const openPanel = async (name) => {
    setPanel(name);
    if (name === 'history') setHistory(await fetchLiveHistory(liveArtifactId));
    if (name === 'sources') {
      await loadCanvasCards();
      setSources(await fetchLiveSources(liveArtifactId));
    }
    if (name === 'controls') setModels(await fetchLiveModelOptions());
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await runLiveArtifact(liveArtifactId);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!live) return <div className="sans text-xs text-muted p-3">{error || 'Loading live artifact…'}</div>;

  const latest = live.latestVersion;
  const lastUpdatedLabel = formatLiveLastUpdated(latest?.createdAt, live.timezone);
  const modelOption = models.find((item) => item.model === live.model);
  const lastRun = live.lastRun;

  return (
    <div className="relative h-full min-h-0 flex flex-col gap-2 py-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`sans text-[9px] rounded-full px-2 py-0.5 ${live.isActive ? 'bg-success-muted text-success' : 'bg-surface-muted text-muted'}`}>
            {live.isActive ? 'LIVE' : 'INACTIVE'} · AGENT FEED
          </span>
          {lastUpdatedLabel && (
            <span className="sans text-[9px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-accent text-on-accent">
              LAST UPDATED: {lastUpdatedLabel}
            </span>
          )}
        </div>
        <span className="sans text-[9px] text-muted shrink-0">
          {latest ? `v${latest.versionNumber}` : 'Awaiting first run'}
        </span>
      </div>

      {lastRun?.sourceCharCount != null && (
        <p className="sans text-[9px] text-muted">
          Last run used {lastRun.sourceCharCount.toLocaleString()} source characters
          {lastRun.status ? ` (${lastRun.status.replace(/_/g, ' ')})` : ''}.
        </p>
      )}

      {enabledSourcesEmpty && (
        <p className="sans text-[9px] text-accent">
          No enabled source content is configured. Add manual text, bookmark cards, or URL lines — then run again.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto text-secondary">
        {latest
          ? <MarkdownMessage content={compact ? latest.overview : latest.markdownBody} compact={compact} />
          : <p className="serif italic text-sm text-muted">Add a source, then run this live artifact.</p>}
      </div>

      {error && <p className="sans text-[9px] text-danger">{error}</p>}

      <div className="flex flex-wrap gap-1 pointer-events-auto">
        <button type="button" onClick={() => void openPanel('history')} className={actionClass}>
          <Clock3 size={11} /> History
        </button>
        <button type="button" onClick={() => void run()} disabled={busy} className={actionClass}>
          <Play size={11} /> {busy ? 'Running…' : 'Run now'}
        </button>
        <button type="button" onClick={() => void openPanel('controls')} className={actionClass}>
          <Settings2 size={11} /> Controls
        </button>
        <button type="button" onClick={() => void openPanel('sources')} className={actionClass}>
          <Waypoints size={11} /> Sources
        </button>
      </div>

      {panel && (
        <div
          className="absolute inset-0 z-30 bg-surface border border-border rounded-lg shadow-xl p-3 overflow-y-auto pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between mb-3">
            <span className="sans text-[10px] uppercase tracking-wider text-accent">{panel}</span>
            <button type="button" onClick={() => setPanel(null)} className="text-muted text-xs">Close</button>
          </div>

          {panel === 'history' && (
            <div className="space-y-3">
              {history.length
                ? history.map((version) => (
                  <article key={version.id} className="border border-border rounded p-3">
                    <div className="sans text-[9px] text-muted mb-2">
                      v{version.versionNumber} · {version.reportDate} · {version.model}
                    </div>
                    <MarkdownMessage content={version.markdownBody} compact />
                  </article>
                ))
                : <p className="text-muted text-xs">No versions yet.</p>}
            </div>
          )}

          {panel === 'controls' && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setLive(await updateLiveArtifact(live.id, live));
                setPanel(null);
              }}
            >
              <label className="flex justify-between text-xs">
                Active
                <input type="checkbox" checked={live.isActive} onChange={(e) => setLive({ ...live, isActive: e.target.checked })} />
              </label>
              <label className="flex justify-between text-xs">
                Schedule
                <select className={inputClass} value={live.scheduleMode} onChange={(e) => setLive({ ...live, scheduleMode: e.target.value })}>
                  <option value="manual">Manual</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label className="flex justify-between text-xs">
                Preferred time
                <input className={inputClass} type="time" value={live.preferredTimeLocal} onChange={(e) => setLive({ ...live, preferredTimeLocal: e.target.value })} />
              </label>
              <label className="flex justify-between text-xs">
                Timezone
                <input className={inputClass} value={live.timezone} onChange={(e) => setLive({ ...live, timezone: e.target.value })} />
              </label>
              <label className="flex justify-between text-xs">
                Model
                <select className={inputClass} value={live.model} onChange={(e) => setLive({ ...live, model: e.target.value, reasoningEffort: null })}>
                  {models.map((item) => <option key={item.model} value={item.model}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex justify-between text-xs">
                Reasoning
                <select className={inputClass} disabled={!modelOption?.reasoningEfforts.length} value={live.reasoningEffort || ''} onChange={(e) => setLive({ ...live, reasoningEffort: e.target.value || null })}>
                  <option value="">Default</option>
                  {(modelOption?.reasoningEfforts || []).map((effort) => <option key={effort}>{effort}</option>)}
                </select>
              </label>
              <label className="flex justify-between text-xs">
                Meaningful changes only
                <input type="checkbox" checked={live.onlyUpdateIfMeaningful} onChange={(e) => setLive({ ...live, onlyUpdateIfMeaningful: e.target.checked })} />
              </label>
              <label className="flex justify-between text-xs">
                Minimum score
                <input className={inputClass} type="number" min="0" max="1" step="0.05" value={live.minimumChangeThreshold} onChange={(e) => setLive({ ...live, minimumChangeThreshold: Number(e.target.value) })} />
              </label>
              <label className="flex justify-between text-xs">
                Max source characters
                <input className={inputClass} type="number" min="1000" max="200000" step="1000" value={live.maxSourceChars} onChange={(e) => setLive({ ...live, maxSourceChars: Number(e.target.value) })} />
              </label>
              <button type="submit" className="bg-accent text-on-accent rounded px-3 py-1.5 text-xs">Save controls</button>
            </form>
          )}

          {panel === 'sources' && (
            <div className="space-y-3">
              {lastRun?.sourceCharCount != null && (
                <p className="sans text-[10px] text-muted border border-border rounded p-2">
                  Last run source context: {lastRun.sourceCharCount.toLocaleString()} characters.
                  Bookmark and URL sources are fetched when the feed runs.
                </p>
              )}

              {sources.map((source, index) => {
                const linkedCard = canvasCardForSource(source, canvasCards);
                const bookmarkUrl = linkedCard?.versions?.[0]?.externalUrl ?? null;
                return (
                  <div key={source.id} className="border border-border rounded p-2">
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        type="checkbox"
                        checked={source.isEnabled}
                        onChange={async (e) => {
                          await updateLiveSource(source.id, { isEnabled: e.target.checked });
                          setSources(await fetchLiveSources(live.id));
                        }}
                      />
                      <span className="sans text-[9px] uppercase tracking-wide text-muted">
                        {sourceTypeLabel(source.sourceType)}
                      </span>
                      <input
                        aria-label={`Source label ${index + 1}`}
                        value={source.label}
                        disabled={source.sourceType === 'previous_version'}
                        onChange={(e) => setSources((items) => items.map((item) => (
                          item.id === source.id ? { ...item, label: e.target.value } : item
                        )))}
                        onBlur={() => void updateLiveSource(source.id, { label: source.label })}
                        className="text-xs flex-1 bg-transparent disabled:text-muted min-w-0"
                      />
                      {source.sourceType !== 'previous_version' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteLiveSource(source.id);
                            setSources(await fetchLiveSources(live.id));
                          }}
                          className="text-danger text-xs"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {linkedCard && (
                      <p className="sans text-[9px] text-muted mt-1">
                        Linked card: {cardTypeLabel(linkedCard.type)} · {linkedCard.name}
                        {bookmarkUrl ? ` · ${bookmarkUrl}` : ''}
                      </p>
                    )}
                    {(source.sourceType === 'manual_text' || source.sourceType === 'project_assumptions') && (
                      <>
                        <p className="sans text-[9px] text-muted mt-2">
                          Paste text or one URL per line — URLs are fetched when the feed runs.
                        </p>
                        <textarea
                          aria-label={`Source text ${index + 1}`}
                          rows={12}
                          value={source.manualText || ''}
                          onChange={(e) => setSources((items) => items.map((item) => (
                            item.id === source.id ? { ...item, manualText: e.target.value } : item
                          )))}
                          onBlur={() => void updateLiveSource(source.id, { manualText: source.manualText || '' })}
                          className={`${sourceTextareaClass} mt-2`}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              <div className="border-t border-border pt-3 space-y-2">
                <div className="sans text-[10px] uppercase tracking-wider text-muted">Add manual source</div>
                <input
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  className="w-full border border-border bg-surface-muted rounded p-2 text-xs"
                  placeholder="Source label"
                />
                <textarea
                  rows={8}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className={sourceTextareaClass}
                  placeholder="Source text or URLs (one per line)"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await addLiveSource(live.id, {
                      sourceType: 'manual_text',
                      label: manualLabel,
                      manualText,
                    });
                    setManualText('');
                    setSources(await fetchLiveSources(live.id));
                  }}
                  className="bg-accent text-on-accent rounded px-3 py-1.5 text-xs"
                >
                  Add manual source
                </button>
              </div>

              {canvasSourceOptions.length > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="sans text-[10px] uppercase tracking-wider text-muted">Add canvas card source</div>
                  <select
                    className="w-full border border-border bg-surface-muted rounded p-2 text-xs"
                    value={canvasSourceId}
                    onChange={(e) => setCanvasSourceId(e.target.value)}
                  >
                    <option value="">Select a canvas card…</option>
                    {canvasSourceOptions.map((option) => (
                      <option key={option.artifactId} value={option.artifactId}>
                        {cardTypeLabel(option.type)} · {option.label} · {option.detail}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!canvasSourceId}
                    onClick={async () => {
                      const option = canvasSourceOptions.find((entry) => entry.artifactId === canvasSourceId);
                      if (!option) return;
                      await addLiveSource(live.id, {
                        sourceType: 'canvas_artifact',
                        sourceId: option.artifactId,
                        label: option.label,
                      });
                      setCanvasSourceId('');
                      setSources(await fetchLiveSources(live.id));
                    }}
                    className="bg-accent text-on-accent rounded px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Add canvas source
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
