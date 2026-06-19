import React from 'react';
import { Image, PanelTop } from 'lucide-react';
import { strings } from '../content/strings.js';

export function MediaMinimalToggle({ minimal, onToggle, floating = false }) {
  const title = minimal ? strings.card.mediaMinimalOff : strings.card.mediaMinimalOn;

  return (
    <button
      type="button"
      data-card-artifact-controls
      title={title}
      aria-label={title}
      aria-pressed={minimal}
      className={
        floating
          ? 'absolute top-1.5 right-1.5 z-20 p-1.5 rounded-md bg-surface/90 border border-border shadow-sm text-muted hover:text-accent pointer-events-auto transition'
          : 'p-1 text-muted hover:text-accent transition pointer-events-auto'
      }
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {minimal ? (
        <PanelTop size={14} strokeWidth={1.8} />
      ) : (
        <Image size={14} strokeWidth={1.8} />
      )}
    </button>
  );
}
