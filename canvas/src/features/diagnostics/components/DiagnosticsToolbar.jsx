import React from 'react';
import { Play, Pause, StepForward, RotateCcw, Waypoints, Box, Layers, X, Focus } from 'lucide-react';
import { ARCHITECTURE_ACTIONS } from '../../../lib/architecture/index.js';
import { ARCHITECTURE_SPEC_VERSION } from '../../../lib/systemArchitectureSpec.js';
import { strings } from '../../../content/strings.js';

export function DiagnosticsToolbar({
  simulation,
  runtime,
  viewMode,
  onToggleViewMode,
  concentrateEnabled,
  onToggleConcentrate,
  onClose,
}) {
  return (
    <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-surface">
      <div className="flex-1 min-w-0">
        <h1 className="sans text-xs uppercase tracking-wider text-primary">
          {strings.diagnostics.title}
        </h1>
        <p className="sans text-[10px] text-muted truncate">
          {runtime?.activeProjectId
            ? `${strings.diagnostics.runtimeHint(runtime.clientRevision, runtime.syncLock)} · ${strings.diagnostics.runtimeExtended(runtime, ARCHITECTURE_SPEC_VERSION)}`
            : strings.diagnostics.runtimeExtended(runtime ?? {}, ARCHITECTURE_SPEC_VERSION)}
        </p>
      </div>
      <label className="sans text-[10px] text-muted flex items-center gap-1.5">
        {strings.diagnostics.actionLabel}
        <select
          value={simulation.state.actionId ?? ''}
          onChange={(e) => simulation.selectAction(e.target.value)}
          className="bg-surface-muted border border-border rounded px-2 py-1 text-xs text-primary"
        >
          {ARCHITECTURE_ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>
      {simulation.isOverviewMode && (
        <button
          type="button"
          onClick={simulation.cycleOverviewFocusMode}
          className={`p-2 rounded-md border transition ${
            simulation.overviewFocusMode === 'ghost'
              ? 'border-accent bg-accent/15 text-accent ring-1 ring-accent/40'
              : simulation.overviewFocusMode === 'secondary'
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-border hover:bg-surface-muted text-secondary hover:text-primary'
          }`}
          title={strings.diagnostics.overviewFocusTitle(simulation.overviewFocusMode)}
          aria-pressed={simulation.overviewFocusMode !== 'off'}
          aria-label={strings.diagnostics.overviewFocusLabel}
        >
          <Waypoints size={14} />
        </button>
      )}
      {viewMode === '3d' && (
        <button
          type="button"
          onClick={onToggleConcentrate}
          disabled={simulation.isOverviewMode}
          className={`p-2 rounded-md border transition disabled:opacity-40 disabled:pointer-events-none ${
            concentrateEnabled
              ? 'border-accent bg-accent-muted text-accent'
              : 'border-border hover:bg-surface-muted text-secondary hover:text-primary'
          }`}
          title={
            simulation.isOverviewMode
              ? strings.diagnostics.concentrateDisabledOverview
              : strings.diagnostics.concentrateTitle
          }
          aria-pressed={concentrateEnabled}
          aria-label={strings.diagnostics.concentrateLabel}
        >
          <Focus size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onToggleViewMode}
        className={`p-2 rounded-md border transition ${
          viewMode === '3d'
            ? 'border-accent bg-accent-muted text-accent'
            : 'border-border hover:bg-surface-muted text-secondary hover:text-primary'
        }`}
        title={viewMode === '3d' ? strings.diagnostics.view2d : strings.diagnostics.view3d}
        aria-pressed={viewMode === '3d'}
        aria-label={viewMode === '3d' ? strings.diagnostics.view2d : strings.diagnostics.view3d}
      >
        {viewMode === '3d' ? <Layers size={14} /> : <Box size={14} />}
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={simulation.isPlaying ? simulation.pause : simulation.play}
          disabled={simulation.isOverviewMode}
          className="p-2 rounded-md border border-border hover:bg-surface-muted text-primary disabled:opacity-40 disabled:pointer-events-none"
          title={simulation.isPlaying ? strings.diagnostics.pause : strings.diagnostics.play}
        >
          {simulation.isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          type="button"
          onClick={simulation.stepOnce}
          disabled={simulation.isOverviewMode}
          className="p-2 rounded-md border border-border hover:bg-surface-muted text-primary disabled:opacity-40 disabled:pointer-events-none"
          title={strings.diagnostics.step}
        >
          <StepForward size={14} />
        </button>
        <button
          type="button"
          onClick={simulation.reset}
          disabled={simulation.isOverviewMode}
          className="p-2 rounded-md border border-border hover:bg-surface-muted text-primary disabled:opacity-40 disabled:pointer-events-none"
          title={strings.diagnostics.reset}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-md border border-border hover:bg-surface-muted text-muted"
        aria-label={strings.diagnostics.close}
      >
        <X size={16} />
      </button>
    </header>
  );
}
