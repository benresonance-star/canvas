import React from 'react';
import {
  formatDisplayValue,
  resolveElementLayer,
} from './bimElementDisplay.js';

export function BimSelectedElementHud({
  element,
  properties = [],
  inspectorOpen = true,
  className = 'bottom-3',
}) {
  const layer = resolveElementLayer(properties);
  const title = element.name || element.ifcClass || 'Unnamed element';
  const positionClass = `pointer-events-none absolute left-3 ${className}`;

  if (inspectorOpen) {
    return (
      <div className={`${positionClass} max-w-lg rounded border border-accent bg-surface/95 px-3 py-2 text-xs text-secondary`}>
        Selected: {title} - {element.ifcGlobalId}
      </div>
    );
  }

  return (
    <div className={`${positionClass} max-w-md rounded border border-accent bg-surface/95 px-3 py-2 text-xs text-secondary shadow-sm`}>
      <div className="text-[10px] uppercase tracking-wider text-muted">Selected</div>
      <div className="serif text-sm text-primary mt-0.5">{title}</div>
      <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt className="text-muted">Type</dt>
        <dd className="text-secondary truncate">{formatDisplayValue(element.typeName)}</dd>
        <dt className="text-muted">Storey</dt>
        <dd className="text-secondary truncate">{formatDisplayValue(element.storeyId)}</dd>
        <dt className="text-muted">Express ID</dt>
        <dd className="text-secondary">{formatDisplayValue(element.expressId)}</dd>
        <dt className="text-muted">Layer</dt>
        <dd className="text-secondary truncate">{formatDisplayValue(layer)}</dd>
        <dt className="text-muted">Element ID</dt>
        <dd className="text-secondary font-mono text-[10px] break-all">{formatDisplayValue(element.id)}</dd>
        <dt className="text-muted">Global ID</dt>
        <dd className="text-secondary font-mono text-[10px] break-all">{formatDisplayValue(element.ifcGlobalId)}</dd>
      </dl>
    </div>
  );
}
