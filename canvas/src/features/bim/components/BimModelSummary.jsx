import React from 'react';
import { Building2 } from 'lucide-react';

export function BimModelSummary({ card, version, compact = false }) {
  const isViewerSession = version?.bim?.viewerKind === 'ifc-viewer-session';
  const filename = version?.filename ?? card?.name ?? 'IFC model';
  const size = Number.isFinite(version?.size) && version.size > 0
    ? `${(version.size / 1024 / 1024).toFixed(1)} MB`
    : isViewerSession
      ? `${version?.bim?.session?.modelRefs?.length ?? 0} files`
      : 'IFC';
  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center text-center px-4 bg-preview-bg">
      <div className="rounded-sm border border-border bg-surface p-3 mb-3 text-secondary">
        <Building2 size={compact ? 22 : 28} strokeWidth={1.5} />
      </div>
      <div className="sans text-xs text-secondary line-clamp-2">{card?.name ?? filename}</div>
      <div className="sans text-[10px] uppercase tracking-wider text-muted mt-1">
        {isViewerSession ? 'IFC VIEWER' : 'BIM MODEL'} · {size}
      </div>
      {!compact && (
        <div className="sans text-[10px] text-muted mt-2 max-w-[14rem]">
          {isViewerSession
            ? 'Open to import and manage one or more IFC files.'
            : 'Open to prepare IFC evidence, table, and inspector.'}
        </div>
      )}
    </div>
  );
}
