import React from 'react';
import {
  BIM_VIEWPORT_FLOATING_PANEL_BOTTOM_CLASS,
  BIM_VIEWPORT_FLOATING_PANEL_TOP_CLASS,
} from '../bim-core/bimViewportLayout.js';

export function BimFloatingSidePanel({
  side,
  width,
  onResizePointerDown,
  ariaLabel,
  children,
}) {
  const horizontalClass = side === 'left' ? 'left-3' : 'right-3';

  return (
    <div
      className={`pointer-events-none absolute ${horizontalClass} ${BIM_VIEWPORT_FLOATING_PANEL_TOP_CLASS} ${BIM_VIEWPORT_FLOATING_PANEL_BOTTOM_CLASS} z-20 flex min-w-0`}
      style={{ width }}
    >
      {side === 'right' ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={ariaLabel}
          onPointerDown={onResizePointerDown}
          className="pointer-events-auto flex w-1.5 shrink-0 cursor-col-resize touch-none items-stretch justify-center rounded-sm hover:bg-accent/20"
        />
      ) : null}
      <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm">
        {children}
      </div>
      {side === 'left' ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={ariaLabel}
          onPointerDown={onResizePointerDown}
          className="pointer-events-auto flex w-1.5 shrink-0 cursor-col-resize touch-none items-stretch justify-center rounded-sm hover:bg-accent/20"
        />
      ) : null}
    </div>
  );
}
