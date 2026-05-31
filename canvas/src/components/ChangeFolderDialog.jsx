import React from 'react';
import { strings } from '../content/strings.js';

export function ChangeFolderDialog({ onClose, onClearAndPick, onKeepAndPick }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--color-overlay-dialog)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-md overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">{strings.changeFolder.label}</div>
          <div className="serif text-lg text-primary">{strings.changeFolder.title}</div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="serif italic text-sm text-secondary leading-relaxed">{strings.changeFolder.body}</p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-2 bg-surface-muted border-t border-border">
          <button
            type="button"
            onClick={onClearAndPick}
            className="sans w-full text-xs bg-accent hover:bg-accent-hover text-on-accent px-4 py-2.5 rounded transition text-left"
          >
            {strings.changeFolder.clearAndPick}
          </button>
          <button
            type="button"
            onClick={onKeepAndPick}
            className="sans w-full text-xs bg-surface border border-border hover:bg-surface-muted text-primary px-4 py-2.5 rounded transition text-left"
          >
            {strings.changeFolder.keepAndPick}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="sans w-full text-xs text-secondary hover:text-primary px-3 py-2 transition"
          >
            {strings.changeFolder.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
