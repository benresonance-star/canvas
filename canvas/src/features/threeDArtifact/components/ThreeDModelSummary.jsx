import React from 'react';
import { Box } from 'lucide-react';
import { detectThreeDFormat, formatThreeDSize, isSupportedThreeDFormat } from '../utils/fileFormat.js';

function triangleLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M tris`;
  if (count >= 1_000) return `${Math.round(count / 1000)}k tris`;
  return `${count} tris`;
}

export function ThreeDModelSummary({ card, version, compact = false }) {
  const filename = version?.filename ?? version?.relativePath ?? '';
  const format = String(version?.ext || detectThreeDFormat(filename) || '').toLowerCase();
  const stats = version?.threeD?.metadata ?? {};
  const source = version?.threeD?.sourceFile ?? {};
  const labels = [
    format ? format.toUpperCase() : null,
    formatThreeDSize(source.sizeBytes ?? version?.size),
    triangleLabel(stats.triangleCount),
  ].filter(Boolean);

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
      {format && !isSupportedThreeDFormat(format) && (
        <div className="sans text-[10px] text-warning mt-2">Unsupported 3D format</div>
      )}
    </div>
  );
}
