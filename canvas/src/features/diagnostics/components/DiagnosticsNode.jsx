import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const NODE_VISUAL_CLASS = {
  current: 'shadow-md',
  path: 'shadow-sm',
  quiet: 'border-border bg-surface',
};

function layerToneClass(nodeDef, role) {
  if (role !== 'current' && role !== 'path') return '';
  const layer = `diagnostics-node--layer-${nodeDef.layer}`;
  return role === 'current'
    ? `${layer} diagnostics-node--focus`
    : `${layer} diagnostics-node--highlighted`;
}

const HIDDEN_HANDLE_CLASS = '!opacity-0 !pointer-events-none !bg-transparent !border-0 !w-2 !h-2';

function DiagnosticsNodeComponent({ data, selected }) {
  const { nodeDef, visualRole, highlighted, ghosted } = data;
  const role = visualRole ?? (highlighted || selected ? 'current' : 'quiet');
  const active = role !== 'quiet' || selected;
  const toneClass = layerToneClass(nodeDef, role);
  return (
    <div
      className={`diagnostics-node rounded-md border px-2 py-1.5 w-[200px] transition-shadow ${
        NODE_VISUAL_CLASS[role] ?? NODE_VISUAL_CLASS.quiet
      } ${toneClass} ${ghosted ? 'diagnostics-node--ghosted' : ''}`}
    >
      <Handle type="target" position={Position.Top} id="top" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="source" position={Position.Top} id="top-source" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="target" position={Position.Left} id="left" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="source" position={Position.Left} id="left-source" className={HIDDEN_HANDLE_CLASS} />
      <p className={`sans text-[10px] uppercase tracking-wider ${
        role === 'current' ? 'text-primary' : role === 'path' ? 'text-secondary' : 'text-muted'
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
      <Handle type="source" position={Position.Bottom} id="bottom" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} id="right" className={HIDDEN_HANDLE_CLASS} />
      <Handle type="target" position={Position.Right} id="right-target" className={HIDDEN_HANDLE_CLASS} />
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
