import React, { useMemo } from 'react';
import { normalizeSonicStudioCardState, summarizeSonicVoice } from '../domain/sonicStudioCard.js';

export function SonicStudioPreview({ card, compact = false }) {
  const state = useMemo(() => normalizeSonicStudioCardState(card), [card]);
  const voices = state.voices.map(summarizeSonicVoice);
  const savePointCount = state.savePoints.length;

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="sans text-[10px] uppercase tracking-wider text-muted">Sonic Studio</div>
            <div className="serif text-base text-primary truncate">{card.name}</div>
          </div>
          <div className="sans text-[10px] text-muted shrink-0">{savePointCount} save points</div>
        </div>
      )}
      <div className="relative flex-1 min-h-0 rounded-md border border-border bg-canvas overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 border-t border-border/70" />
        <div className="absolute inset-y-0 left-1/2 border-l border-border/70" />
        {voices.map((voice) => (
          <div
            key={voice.id}
            className="absolute h-3 w-3 -ml-1.5 -mt-1.5 rounded-full border border-surface shadow-sm bg-accent"
            style={{
              left: `${((voice.x + 1) / 2) * 100}%`,
              top: `${(1 - ((voice.y + 1) / 2)) * 100}%`,
              opacity: 0.65 + Math.min(0.3, voice.gain * 0.2),
            }}
            title={voice.name}
          />
        ))}
        <div className="absolute left-2 bottom-2 right-2 grid grid-cols-2 gap-1">
          {voices.slice(0, 4).map((voice) => (
            <div key={voice.id} className="sans text-[9px] text-secondary truncate">
              {voice.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
