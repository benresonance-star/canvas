import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const NODE_VISUAL_CLASS = {
  current: 'border-accent bg-surface shadow-md ring-1 ring-accent/30',
  path: 'border-[var(--color-diagnostics-path)] bg-surface shadow-sm ring-1 ring-[color-mix(in_srgb,var(--color-diagnostics-path)_35%,transparent)]',
  quiet: 'border-border bg-surface',
};

function DiagnosticsNodeComponent({ data, selected }) {
  const { nodeDef, visualRole, highlighted } = data;
  const role = visualRole ?? (highlighted || selected ? 'current' : 'quiet');
  const active = role !== 'quiet' || selected;
  return (
    <div
      className={`diagnostics-node rounded-md border px-2 py-1.5 w-[200px] transition-shadow ${
        NODE_VISUAL_CLASS[role] ?? NODE_VISUAL_CLASS.quiet
      } ${selected ? 'ring-2 ring-primary/30' : ''}`}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-muted !w-2 !h-2" />
      <Handle type="source" position={Position.Top} id="top-source" className="!bg-muted !w-2 !h-2" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-muted !w-2 !h-2" />
      <Handle type="source" position={Position.Left} id="left-source" className="!bg-muted !w-2 !h-2" />
      <p className={`sans text-[10px] uppercase tracking-wider ${
        role === 'path' ? 'text-[var(--color-diagnostics-path)]' : 'text-muted'
      }`}
      >
        {nodeDef.layer.replace('client-', '')}
      </p>
      <p className={`sans text-xs font-medium leading-tight mt-0.5 ${
        active ? 'text-primary' : 'text-primary'
      }`}
      >
        {nodeDef.label}
      </p>
      <p className="sans text-[10px] text-secondary line-clamp-2 mt-1 leading-snug">{nodeDef.purpose}</p>
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-muted !w-2 !h-2" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!bg-muted !w-2 !h-2" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-muted !w-2 !h-2" />
      <Handle type="target" position={Position.Right} id="right-target" className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

export const DiagnosticsNode = memo(DiagnosticsNodeComponent);

function DiagnosticsLayerComponent({ data }) {
  return (
    <div className="diagnostics-layer h-full w-full rounded-lg border border-dashed border-border/80 pointer-events-none">
      <p className="diagnostics-layer-title sans uppercase text-muted px-2 py-1">{data.label}</p>
    </div>
  );
}

export const DiagnosticsLayerNode = memo(DiagnosticsLayerComponent);
