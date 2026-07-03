import React from 'react';
import { GitBranch, Network, Sparkles } from 'lucide-react';

export function StudioPreview({ card, compact = false }) {
  const counts = card.studioCounts ?? {};
  const surfaces = card.studioSurfaces ?? [];
  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="shrink-0 h-8 w-8 rounded-md border border-accent-border bg-accent-muted text-accent flex items-center justify-center">
          <Network size={16} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="sans text-[10px] uppercase tracking-wider text-muted">
            {card.studioKind ?? 'domain'} studio
          </div>
          <div className="serif text-sm text-primary line-clamp-2">{card.name}</div>
        </div>
      </div>
      {!compact && card.studioSummary && (
        <p className="sans text-xs text-secondary line-clamp-3">{card.studioSummary}</p>
      )}
      <div className="mt-auto grid grid-cols-3 gap-1.5 sans text-[10px] text-secondary">
        <div className="rounded-md border border-border bg-canvas px-2 py-1">
          <div className="text-muted uppercase tracking-wider">State</div>
          <div className="text-primary truncate">{card.studioState ?? 'seeded'}</div>
        </div>
        <div className="rounded-md border border-border bg-canvas px-2 py-1">
          <div className="flex items-center gap-1 text-muted uppercase tracking-wider"><GitBranch size={10} /> Surfaces</div>
          <div className="text-primary">{surfaces.length}</div>
        </div>
        <div className="rounded-md border border-border bg-canvas px-2 py-1">
          <div className="flex items-center gap-1 text-muted uppercase tracking-wider"><Sparkles size={10} /> Ready</div>
          <div className="text-primary">{counts.promotions ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
