import React from 'react';

export function NotePreviewFrame({ content, contentKey, isActive }) {
  return (
    <div className="h-full w-full min-h-0 overflow-hidden relative flex flex-col">
      <div
        key={contentKey}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${isActive ? '' : 'pointer-events-none'}`}
      >
        <div className="serif text-sm text-secondary leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}
