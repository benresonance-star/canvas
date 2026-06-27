import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { orderPathStepIdsByFlowSequence } from '../domain/flowPaths.js';
import {
  pathStepDisplayTitle,
  resolvePathCurrentActiveStepIdInSequence,
} from '../domain/flowPathStepDisplay.js';
import {
  FLOW_STEP_RUN_STATES,
  flowStepRunStateMeta,
  resolvePathStepRunState,
} from '../domain/flowStepRunState.js';
import { FlowStepRunStateGlyph } from './FlowStepRunStateMenu.jsx';

const FLOW_INSPECTOR_REMOVE_BUTTON_CLASS =
  'sans w-full flex items-center justify-center gap-1.5 rounded-full border border-danger-border bg-danger-muted text-danger px-3 py-2 text-xs hover:bg-danger-border/40 transition';

function stepDisplayTitle(node, cardsById) {
  return pathStepDisplayTitle(node, cardsById);
}

export function FlowPathInspectorFields({
  path,
  nodesById,
  cardsById,
  edges = [],
  selectedStepIds = [],
  onNameChange,
  onAddStepsToPath,
  onStepRunStateChange,
  onRemoveStepFromPath,
  onDeletePathOnly,
  onDeletePathAndSteps,
  readOnly = false,
}) {
  if (!path) return null;

  const orderedStepIds = orderPathStepIdsByFlowSequence(path.stepIds ?? [], edges, nodesById);
  const memberNodes = orderedStepIds
    .map((id) => nodesById.get(id))
    .filter(Boolean);
  const addableCount = selectedStepIds.filter((id) => !path.stepIds?.includes(id)).length;
  const currentActiveStepId = resolvePathCurrentActiveStepIdInSequence(path, edges, nodesById);
  const currentActiveNode = currentActiveStepId ? nodesById.get(currentActiveStepId) : null;
  const currentActiveTitle = currentActiveNode
    ? stepDisplayTitle(currentActiveNode, cardsById)
    : strings.flow.pathCurrentActiveStepNone;

  return (
    <div className="space-y-3">
      <div>
        <label className="sans text-[10px] text-muted" htmlFor="flow-path-name">
          {strings.flow.pathNameLabel}
        </label>
        <input
          id="flow-path-name"
          value={path.name ?? ''}
          onChange={(event) => onNameChange(event.target.value)}
          readOnly={readOnly}
          className="sans mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-70"
        />
      </div>
      <div>
        <div className="sans text-[10px] text-muted">{strings.flow.pathCurrentActiveStep}</div>
        <div className={`serif text-sm mt-0.5 break-words ${currentActiveNode ? 'text-primary' : 'text-muted'}`}>
          {currentActiveTitle}
        </div>
      </div>
      <p className="sans text-xs text-muted">
        {strings.flow.pathMemberCount(memberNodes.length)}
      </p>
      {memberNodes.length > 0 && (
        <ul className="sans text-xs text-secondary space-y-1">
          {memberNodes.map((node) => {
            const runState = resolvePathStepRunState(path, node.id);
            return (
              <li key={node.id} className="flex items-center gap-2 min-w-0">
                <FlowStepRunStateGlyph stateId={runState} className="w-4 text-center text-primary" />
                <span className="truncate flex-1 min-w-0">{stepDisplayTitle(node, cardsById)}</span>
                {!readOnly && onStepRunStateChange && (
                  <select
                    value={runState}
                    aria-label={strings.flow.stepRunState}
                    className="sans shrink-0 max-w-[7.5rem] rounded border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-secondary focus:outline-none focus:border-accent"
                    onChange={(event) => onStepRunStateChange(path.id, node.id, event.target.value)}
                  >
                    {FLOW_STEP_RUN_STATES.map((stateId) => (
                      <option key={stateId} value={stateId}>
                        {flowStepRunStateMeta(stateId).glyph} {flowStepRunStateMeta(stateId).label}
                      </option>
                    ))}
                  </select>
                )}
                {!readOnly && onRemoveStepFromPath && (
                  <button
                    type="button"
                    aria-label={strings.flow.removeStepFromPath}
                    title={strings.flow.removeStepFromPath}
                    className="shrink-0 p-0.5 rounded text-muted hover:text-danger transition"
                    onClick={() => onRemoveStepFromPath(path.id, node.id)}
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && addableCount > 0 && (
        <button
          type="button"
          onClick={onAddStepsToPath}
          className="sans w-full flex items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs hover:border-accent transition"
        >
          <Plus size={13} />
          {strings.flow.addStepsToPath}
        </button>
      )}
      {!readOnly && onDeletePathOnly && onDeletePathAndSteps && (
        <div className="space-y-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => onDeletePathOnly(path.id)}
            className="sans w-full flex items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs text-primary hover:border-accent transition"
          >
            <Trash2 size={13} />
            {strings.flow.deleteFlowPath}
          </button>
          <p className="sans text-xs text-muted">{strings.flow.deleteFlowPathHint}</p>
          <button
            type="button"
            onClick={() => onDeletePathAndSteps(path.id)}
            className={FLOW_INSPECTOR_REMOVE_BUTTON_CLASS}
          >
            <Trash2 size={13} />
            {strings.flow.deleteFlowPathAndSteps}
          </button>
          <p className="sans text-xs text-muted">{strings.flow.deleteFlowPathAndStepsHint}</p>
        </div>
      )}
      <p className="sans text-xs text-muted">{strings.flow.pathWorkflowHint}</p>
    </div>
  );
}
