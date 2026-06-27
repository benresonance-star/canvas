import React from 'react';
import { Play, Pause, StepForward, RotateCcw, X } from 'lucide-react';
import { ARCHITECTURE_ACTIONS } from '../../../lib/architecture/index.js';
import { strings } from '../../../content/strings.js';

export function DiagnosticsToolbar({ simulation, runtime, onClose }) {
  return (
    <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-surface">
      <div className="flex-1 min-w-0">
        <h1 className="sans text-xs uppercase tracking-wider text-primary">
          {strings.diagnostics.title}
        </h1>
        {runtime?.activeProjectId && (
          <p className="sans text-[10px] text-muted truncate">
            {strings.diagnostics.runtimeHint(runtime.clientRevision, runtime.syncLock)}
          </p>
        )}
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
