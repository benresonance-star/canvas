import React, { useState } from 'react';
import { markdownViewToggleLabel } from '../lib/markdownMessage.js';
import { MarkdownMessage } from './MarkdownMessage.jsx';

export function NotePreviewFrame({
  content,
  contentKey,
  isActive,
  compact = true,
}) {
  const [formattedView, setFormattedView] = useState(true);
  const bodyClass = compact
    ? 'px-0 py-0 text-sm text-secondary'
    : 'px-12 py-10 text-lg text-primary';
  const contentClass = compact
    ? 'max-w-full'
    : 'max-w-2xl mx-auto';
  const buttonClass = compact
    ? 'px-2 py-0.5 text-[9px]'
    : 'px-2.5 py-1 text-[10px]';

  return (
    <div className="h-full w-full min-h-0 overflow-hidden relative flex flex-col">
      <div
        key={contentKey}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${isActive ? '' : 'pointer-events-none'}`}
      >
        {content ? (
          <div className={`sticky top-0 z-10 flex justify-end ${compact ? 'px-1 pt-0.5' : 'px-4 pt-4'}`}>
            <button
              type="button"
              className={`sans rounded-full border border-border-subtle bg-surface-muted/90 text-muted shadow-sm hover:text-primary pointer-events-auto ${buttonClass}`}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setFormattedView((value) => !value);
              }}
              aria-pressed={!formattedView}
            >
              {markdownViewToggleLabel(formattedView)}
            </button>
          </div>
        ) : null}
        <div className={`leading-relaxed ${bodyClass}`}>
          <div className={contentClass}>
            {formattedView ? (
              <MarkdownMessage content={content} compact={compact} />
            ) : (
              <div className="serif whitespace-pre-wrap">{content}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
