import React from 'react';
import { Box } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { detectThreeDFormat, formatThreeDSize, isSupportedThreeDFormat } from '../utils/fileFormat.js';

function triangleLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M tris`;
  if (count >= 1_000) return `${Math.round(count / 1000)}k tris`;
  return `${count} tris`;
}

function feasibilityMessage(mode, { compact = false } = {}) {
  switch (mode) {
    case 'hard_limit':
      return strings.threeD.hardLimit;
    case 'no_folder':
      return compact
        ? strings.threeD.connectFolderHint
        : `${strings.threeD.connectFolderHint} ${strings.preview.modalResyncHint}`;
    case 'folder_on_demand':
      return compact
        ? strings.threeD.loadFromFolderHint
        : strings.threeD.tooLargeForInline;
    case 'no_source':
      return strings.threeD.noSource;
    case 'unsupported':
      return null;
    default:
      return null;
  }
}

export function ThreeDModelSummary({
  card,
  version,
  compact = false,
  feasibility = null,
  warnHeavy = false,
}) {
  const filename = version?.filename ?? version?.relativePath ?? '';
  const format = String(version?.ext || detectThreeDFormat(filename) || '').toLowerCase();
  const stats = version?.threeD?.metadata ?? {};
  const source = version?.threeD?.sourceFile ?? {};
  const labels = [
    format ? format.toUpperCase() : null,
    formatThreeDSize(source.sizeBytes ?? version?.size),
    triangleLabel(stats.triangleCount),
  ].filter(Boolean);
  const message = feasibility?.mode
    ? feasibilityMessage(feasibility.mode, { compact })
    : null;

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center text-center px-3">
      <div className="w-14 h-14 rounded-md border border-border bg-surface-muted flex items-center justify-center text-muted mb-3">
        <Box size={26} strokeWidth={1.5} />
      </div>
      <div className={`serif text-primary line-clamp-2 ${compact ? 'text-sm' : 'text-base'}`}>
        {card?.name || source.filename || filename || '3D model'}
      </div>
      <div className="sans text-[10px] uppercase tracking-wider text-muted mt-1">
        {labels.length ? labels.join(' · ') : '3D MODEL'}
      </div>
      {message && (
        <div className="sans text-[10px] text-muted mt-2 max-w-[240px] leading-relaxed">
          {message}
        </div>
      )}
      {warnHeavy && (
        <div className="sans text-[10px] text-warning mt-2 max-w-[240px]">
          {strings.threeD.heavyModelWarning}
        </div>
      )}
      {format && !isSupportedThreeDFormat(format) && (
        <div className="sans text-[10px] text-warning mt-2">Unsupported 3D format</div>
      )}
    </div>
  );
}
