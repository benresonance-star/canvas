import React from 'react';
import {
  FLOW_LOCAL_NODE_TYPES,
  normalizeFlowLocalNodeType,
} from '../domain/flowLocalNodeTypes.js';
import { resolveFlowLocalNodeTypeColor } from '../domain/flowLocalNodeTypeColors.js';

const MENU_ITEM_CLASS =
  'sans flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-surface-muted';

function stopBubble(event) {
  event.stopPropagation();
}

export function FlowLocalNodeTypeMenu({
  selectedTypeId,
  onSelect,
  ariaLabel,
  localNodeTypeColors,
  onColorChange,
}) {
  const normalizedSelected = normalizeFlowLocalNodeType(selectedTypeId);
  const showColors = Boolean(onColorChange);

  return (
    <div role="listbox" aria-label={ariaLabel} className="space-y-0.5">
      {FLOW_LOCAL_NODE_TYPES.map((type) => {
        const Icon = type.icon;
        const selected = normalizedSelected === type.id;
        const color = resolveFlowLocalNodeTypeColor(localNodeTypeColors, type.id);
        return (
          <div key={type.id} className="flex items-center gap-1.5">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={`${MENU_ITEM_CLASS} ${selected ? 'bg-surface-muted text-primary' : 'text-secondary'}`}
              onClick={() => onSelect(type.id)}
            >
              <Icon size={14} strokeWidth={1.5} className={`shrink-0 ${type.iconClassName}`} />
              <span className="truncate">{type.label}</span>
            </button>
            {showColors && (
              <input
                type="color"
                value={color}
                aria-label={`${type.label} color`}
                className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                onPointerDown={stopBubble}
                onClick={stopBubble}
                onChange={(event) => onColorChange(type.id, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
