import React, { useMemo, useState } from 'react';
import { classifyBim4dTasks } from '../bim-core/bim4d.js';

export function Bim4dHud({
  sequences = [],
  activeSequenceId = null,
  activeTaskId = null,
  savedResultSets = [],
  selectedElementId = null,
  queryElementIds = [],
  onCreateResultSet = () => {},
  onCreateSequence = () => {},
  onCreateTask = () => {},
  onSetActiveSequence = () => {},
  onSetActiveTask = () => {},
  onStepTask = () => {},
}) {
  const [taskName, setTaskName] = useState('');
  const activeSequence = sequences.find((sequence) => sequence.id === activeSequenceId) ?? sequences[0] ?? null;
  const tasks = useMemo(
    () => classifyBim4dTasks(activeSequence, activeTaskId ?? activeSequence?.tasks?.[0]?.id),
    [activeSequence, activeTaskId],
  );
  const activeTask = tasks.find((task) => task.timelineState === 'current') ?? tasks[0] ?? null;
  const hasSelection = Boolean(selectedElementId) || queryElementIds.length > 0;

  return (
    <div className="pointer-events-auto w-[26rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">4D sequencing</div>
          <div className="text-secondary">{activeSequence?.name ?? 'No sequence'}</div>
        </div>
        <button
          type="button"
          onClick={onCreateSequence}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted"
        >
          New
        </button>
      </div>

      {sequences.length > 0 && (
        <select
          value={activeSequence?.id ?? ''}
          onChange={(event) => onSetActiveSequence(event.target.value)}
          className="mb-2 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
          aria-label="4D sequence"
        >
          {sequences.map((sequence) => (
            <option key={sequence.id} value={sequence.id}>{sequence.name}</option>
          ))}
        </select>
      )}

      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
        <input
          value={taskName}
          onChange={(event) => setTaskName(event.target.value)}
          placeholder="Task name"
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
        />
        <button
          type="button"
          disabled={!activeSequence || !hasSelection}
          onClick={() => {
            onCreateTask(taskName || 'Linked BIM task');
            setTaskName('');
          }}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Link
        </button>
      </div>

      <div className="mb-2 flex gap-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => onCreateResultSet('Saved 4D set')}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save set
        </button>
        <button
          type="button"
          disabled={!activeSequence || tasks.length === 0}
          onClick={() => onStepTask(-1)}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={!activeSequence || tasks.length === 0}
          onClick={() => onStepTask(1)}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <div className="max-h-56 overflow-auto rounded border border-border">
        {tasks.length === 0 ? (
          <div className="px-2 py-3 text-muted">Create a task from a selection or BQL result.</div>
        ) : tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onSetActiveTask(task.id)}
            className={`flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${
              task.id === activeTask?.id ? 'bg-accent/15 text-primary' : 'text-secondary hover:bg-surface-muted'
            }`}
          >
            <span className="min-w-0 truncate">
              <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.color }} />
              {task.name}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">{task.timelineState}</span>
          </button>
        ))}
      </div>

      {savedResultSets.length > 0 && (
        <div className="mt-2 text-[10px] text-muted">
          {savedResultSets.length} saved result {savedResultSets.length === 1 ? 'set' : 'sets'} available for linking.
        </div>
      )}
    </div>
  );
}
