import React from 'react';
import {
  FLOW_STEP_RUN_STATES,
  flowStepRunStateMeta,
  normalizeFlowStepRunState,
} from '../domain/flowStepRunState.js';

const MENU_ITEM_CLASS =
  'sans flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-surface-muted';

export function FlowStepRunStateMenu({
  selectedStateId,
  onSelect,
  ariaLabel,
}) {
  const normalizedSelected = normalizeFlowStepRunState(selectedStateId);

  return (
    <div role="listbox" aria-label={ariaLabel} className="space-y-0.5">
      {FLOW_STEP_RUN_STATES.map((stateId) => {
        const meta = flowStepRunStateMeta(stateId);
        const selected = normalizedSelected === stateId;
        return (
          <button
            key={stateId}
            type="button"
            role="option"
            aria-selected={selected}
            className={`${MENU_ITEM_CLASS} ${selected ? 'bg-surface-muted text-primary' : 'text-secondary'}`}
            onClick={() => onSelect(stateId)}
          >
            <span className="shrink-0 w-4 text-center" aria-hidden>{meta.glyph}</span>
            <span className="truncate">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FlowStepRunStateGlyph({ stateId, className = '' }) {
  const meta = flowStepRunStateMeta(stateId);
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`} aria-hidden>
      {meta.glyph}
    </span>
  );
}
