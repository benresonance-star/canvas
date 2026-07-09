import React from 'react';
import { Building2 } from 'lucide-react';

export function BimModelSummary({ card, version, compact = false }) {
  const isViewerSession = version?.bim?.viewerKind === 'ifc-viewer-session';
  const sessionModelRefs = isViewerSession && Array.isArray(version?.bim?.session?.modelRefs)
    ? version.bim.session.modelRefs.filter((ref) => ref?.status !== 'removed')
    : [];
  const visibleModelNames = sessionModelRefs
    .map((ref) => String(ref?.label ?? ref?.sourceName ?? '').trim())
    .filter(Boolean);
  const previewNames = visibleModelNames.slice(0, compact ? 2 : 3);
  const remainingNameCount = Math.max(0, visibleModelNames.length - previewNames.length);
  const filename = version?.filename ?? card?.name ?? 'IFC model';
  const size = Number.isFinite(version?.size) && version.size > 0
    ? `${(version.size / 1024 / 1024).toFixed(1)} MB`
    : isViewerSession
      ? `${sessionModelRefs.length} files`
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
      {isViewerSession && previewNames.length > 0 && (
        <div className="sans mt-2 max-w-[15rem] space-y-0.5 text-[10px] text-secondary">
          {previewNames.map((name) => (
            <div key={name} className="truncate">{name}</div>
          ))}
          {remainingNameCount > 0 && (
            <div className="text-muted">+ {remainingNameCount} more</div>
          )}
        </div>
      )}
      {!compact && (
        <div className="sans text-[10px] text-muted mt-2 max-w-[14rem]">
          {isViewerSession
            ? previewNames.length > 0
              ? 'Open to manage and compare these IFC files.'
              : 'Open to import and manage one or more IFC files.'
            : 'Open to prepare IFC evidence, table, and inspector.'}
        </div>
      )}
    </div>
  );
}
