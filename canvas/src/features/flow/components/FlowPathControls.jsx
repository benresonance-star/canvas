import React from 'react';
import { ChevronDown, Copy, Plus, Route } from 'lucide-react';
import { strings } from '../../../content/strings.js';

export function FlowPathControls({
  selectedPathId = null,
  selectedStepIds = [],
  paths = [],
  onNewPath,
  onDuplicatePath,
  onAddStepsToPath,
  disabled = false,
}) {
  const selectedPath = paths.find((path) => path.id === selectedPathId) ?? null;
  const addableStepIds = selectedStepIds.filter(
    (id) => !selectedPath?.stepIds?.includes(id),
  );
  const hasPathSelected = Boolean(selectedPathId);
  const hasStepsSelected = selectedStepIds.length > 0;
  const canAddToPath = hasPathSelected && addableStepIds.length > 0 && !disabled;
  const canNewPath = hasStepsSelected && !hasPathSelected && !disabled;
  const canDuplicatePath = hasPathSelected && !canAddToPath && !disabled;

  let primaryLabel = strings.flow.newFlowPath;
  let PrimaryIcon = Route;
  let primaryAction = onNewPath;
  let primaryEnabled = canNewPath;
  let primaryTitle = canNewPath
    ? strings.flow.newFlowPath
    : strings.flow.newFlowPathDisabled;

  if (canAddToPath) {
    primaryLabel = strings.flow.addStepsToPath;
    PrimaryIcon = Plus;
    primaryAction = onAddStepsToPath;
    primaryEnabled = true;
    primaryTitle = strings.flow.addStepsToPathHint;
  } else if (hasPathSelected) {
    primaryLabel = strings.flow.duplicateFlowPath;
    PrimaryIcon = Copy;
    primaryAction = onDuplicatePath;
    primaryEnabled = canDuplicatePath;
    primaryTitle = canDuplicatePath
      ? strings.flow.duplicateFlowPath
      : strings.flow.duplicateFlowPathDisabled;
  }

  return (
    <div className="flex w-full gap-1">
      <button
        type="button"
        disabled={!primaryEnabled}
        title={primaryTitle}
        onClick={primaryAction}
        className="sans flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs text-primary transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PrimaryIcon size={13} />
        {primaryLabel}
      </button>
      <div
        className="sans shrink-0 flex items-center justify-center rounded-full px-2.5 py-2 text-xs invisible pointer-events-none"
        aria-hidden="true"
      >
        <ChevronDown size={12} />
      </div>
    </div>
  );
}
