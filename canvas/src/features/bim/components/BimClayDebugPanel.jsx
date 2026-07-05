import React, { useEffect, useState } from 'react';
import {
  CLAY_DEBUG_CHANGE_EVENT,
  CLAY_DEBUG_FRAME_EVENT,
  CLAY_DEBUG_KEY,
  CLAY_DEBUG_MARKER_EVENT,
  getClayEffectDebugMarker,
  getClayDebugMarker,
  isBimClayDebugEnabled,
  requestClayDebugSync,
  setClayDebugEnabled,
  subscribeClayDebug,
} from '../bim-core/bimClayDebug.js';

function formatClayDebugValue(value) {
  if (value == null) return '—';
  if (value === 'skip') return 'skip';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  return String(value);
}

function ClayDebugRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[9px] font-mono tabular-nums">
      <span className="text-muted uppercase tracking-wider">{label}</span>
      <span className="text-secondary">{formatClayDebugValue(value)}</span>
    </div>
  );
}

function readFrameReapplySnapshot() {
  return globalThis.__canvasBimClayFrameReapply ?? null;
}

function resolveEffectMarker(marker) {
  const stored = getClayEffectDebugMarker();
  if (stored?.source === 'effect') return stored;
  if (marker?.source === 'effect') return marker;
  return stored ?? null;
}

function mergeLiveClayValues(marker, { clayOriginalColorBlend, claySurfaceColor }) {
  const stats = { ...(marker?.stats ?? {}) };
  const uiOrig = Number.isFinite(Number(clayOriginalColorBlend)) ? Number(clayOriginalColorBlend) : null;
  const appliedOrig = Number.isFinite(stats.surfaceBlend) ? stats.surfaceBlend : null;
  if (stats.surfaceColor == null && claySurfaceColor) {
    stats.surfaceColor = claySurfaceColor;
  }
  if (stats.blendZone == null && appliedOrig != null) {
    if (appliedOrig <= 0) stats.blendZone = 'native';
    else if (appliedOrig >= 1) stats.blendZone = 'full';
    else stats.blendZone = 'partial';
  } else if (stats.blendZone == null && uiOrig != null) {
    if (uiOrig <= 0) stats.blendZone = 'native';
    else if (uiOrig >= 1) stats.blendZone = 'full';
    else stats.blendZone = 'partial';
  }
  return { marker, stats, uiOrig, appliedOrig };
}

export function BimClayDebugPanel({
  clayOriginalColorBlend = null,
  claySurfaceColor = null,
}) {
  const [enabled, setEnabled] = useState(() => isBimClayDebugEnabled());
  const [marker, setMarker] = useState(() => getClayEffectDebugMarker() ?? getClayDebugMarker());
  const [frameReapply, setFrameReapply] = useState(() => readFrameReapplySnapshot());

  useEffect(() => subscribeClayDebug((next) => {
    const effectMarker = resolveEffectMarker(next);
    if (effectMarker) setMarker(effectMarker);
  }), []);

  useEffect(() => {
    const syncEnabled = () => setEnabled(isBimClayDebugEnabled());
    const refreshMarker = () => {
      setMarker(getClayEffectDebugMarker() ?? getClayDebugMarker());
      setFrameReapply(readFrameReapplySnapshot());
    };
    const onStorage = (event) => {
      if (event.key === CLAY_DEBUG_KEY) syncEnabled();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CLAY_DEBUG_CHANGE_EVENT, syncEnabled);
    window.addEventListener(CLAY_DEBUG_MARKER_EVENT, refreshMarker);
    window.addEventListener(CLAY_DEBUG_FRAME_EVENT, refreshMarker);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CLAY_DEBUG_CHANGE_EVENT, syncEnabled);
      window.removeEventListener(CLAY_DEBUG_MARKER_EVENT, refreshMarker);
      window.removeEventListener(CLAY_DEBUG_FRAME_EVENT, refreshMarker);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = () => {
      setMarker(getClayEffectDebugMarker() ?? getClayDebugMarker());
      setFrameReapply(readFrameReapplySnapshot());
    };
    refresh();
    requestClayDebugSync();
    const interval = window.setInterval(refresh, 500);
    return () => window.clearInterval(interval);
  }, [enabled, clayOriginalColorBlend, claySurfaceColor]);

  if (!enabled) {
    return (
      <div
        className="flex items-center justify-between gap-2 rounded border border-dashed border-border/80 bg-surface/60 px-2 py-1.5 text-[9px] text-muted"
        title="Show clay material apply diagnostics"
      >
        <span>Clay debug off</span>
        <button
          type="button"
          onClick={() => setClayDebugEnabled(true)}
          className="rounded border border-border bg-surface px-2 py-0.5 text-[9px] uppercase tracking-wider text-secondary hover:bg-surface-muted"
          aria-label="Enable clay debug"
        >
          Turn on
        </button>
      </div>
    );
  }

  const { marker: displayMarker, stats, uiOrig, appliedOrig } = mergeLiveClayValues(
    resolveEffectMarker(marker),
    { clayOriginalColorBlend, claySurfaceColor },
  );
  const frameStats = frameReapply?.stats ?? {};
  const waitingForApply = !displayMarker?.phase;
  const origMismatch = uiOrig != null && appliedOrig != null && Math.abs(uiOrig - appliedOrig) > 0.0001;
  const showFrameFallback = waitingForApply && frameReapply?.count > 0;

  return (
    <div
      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[9px] text-secondary"
      aria-label="Clay material debug markers"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wider text-amber-200">Clay debug</span>
        <button
          type="button"
          onClick={() => setClayDebugEnabled(false)}
          className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-amber-100/80 hover:bg-amber-500/20"
          aria-label="Disable clay debug"
        >
          Off
        </button>
      </div>
      {waitingForApply ? (
        <div className="mb-1 text-[8px] text-amber-100/70">
          Waiting for slider apply… move Orig slightly if this stays empty.
          {showFrameFallback ? ` (frame-only: ${frameReapply.count} runs)` : ''}
        </div>
      ) : null}
      <ClayDebugRow label="phase" value={displayMarker?.phase} />
      <ClayDebugRow label="source" value={displayMarker?.source} />
      <ClayDebugRow label="ok" value={displayMarker?.cancelled ? 'cancelled' : displayMarker?.ok} />
      <ClayDebugRow label="reason" value={displayMarker?.reason} />
      <ClayDebugRow label="error" value={displayMarker?.error} />
      {origMismatch ? (
        <div className="mb-1 text-[8px] text-amber-200">
          Slider apply pending — UI {Math.round(uiOrig * 100)}% vs applied {Math.round(appliedOrig * 100)}%.
        </div>
      ) : null}
      <ClayDebugRow label="orig-ui" value={uiOrig} />
      <ClayDebugRow label="orig" value={appliedOrig} />
      <ClayDebugRow label="zone" value={stats.blendZone} />
      <ClayDebugRow label="surf" value={stats.surfaceColor} />
      <ClayDebugRow label="run" value={displayMarker?.runSeq} />
      <ClayDebugRow label="ids" value={stats.allLocalIdsCount ?? displayMarker?.localIdsCount} />
      <ClayDebugRow label="ifc-col" value={stats.coloredDefinitionCount} />
      <ClayDebugRow label="mat-grp" value={stats.materialGroupCount} />
      <ClayDebugRow label="def-map" value={stats.definitionMapSize} />
      <ClayDebugRow label="blended" value={stats.highlightedLocalIdCount} />
      <ClayDebugRow label="native" value={stats.nativeLeftCount ?? stats.skippedLocalIdCount} />
      <ClayDebugRow label="fallback" value={stats.fallbackUniformCount} />
      <ClayDebugRow label="glazed" value={stats.glazingCount} />
      <ClayDebugRow label="hi-calls" value={stats.highlightCallCount} />
      <ClayDebugRow label="reset" value={stats.resetCalled ?? stats.resetOnly} />
      <ClayDebugRow label="blend" value={displayMarker?.blendOnly} />
      <ClayDebugRow
        label="upd-before"
        value={displayMarker?.blendOnly && displayMarker?.updateBeforeOk == null ? 'skip' : displayMarker?.updateBeforeOk}
      />
      <ClayDebugRow label="upd-after" value={displayMarker?.updateAfterOk} />
      <ClayDebugRow label="ms" value={displayMarker?.totalMs ?? displayMarker?.marks?.at(-1)?.ms} />
      <ClayDebugRow label="at" value={displayMarker?.at} />
      <div className="my-1 border-t border-amber-500/20" />
      <ClayDebugRow label="frames" value={frameReapply?.count} />
      <ClayDebugRow label="frm-reset" value={frameStats.resetCalled} />
      <ClayDebugRow label="frm-blend" value={frameStats.highlightedLocalIdCount} />
      <ClayDebugRow label="frm-native" value={frameStats.nativeLeftCount ?? frameStats.skippedLocalIdCount} />
      <ClayDebugRow label="leave-full" value={stats.leavingFull ?? frameStats.leavingFull} />
      <ClayDebugRow label="last" value={stats.lastBlend ?? frameStats.lastBlend} />
    </div>
  );
}
