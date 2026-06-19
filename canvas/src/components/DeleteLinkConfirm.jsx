import React from 'react';
import { strings } from '../content/strings.js';

export function DeleteLinkConfirm({ linkName, folderConnected = false, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-[var(--color-overlay-dialog)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-link-title"
        className="bg-surface rounded-lg w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <div id="delete-link-title" className="serif text-lg text-primary">
            {strings.bookmark.deleteTitle}
          </div>
          <p className="sans text-sm text-secondary mt-2">
            {strings.bookmark.deleteBody(linkName, { folderConnected })}
          </p>
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-2 bg-surface-muted">
          <button
            type="button"
            onClick={onCancel}
            className="sans text-xs text-secondary hover:text-primary px-3 py-2 transition"
          >
            {strings.bookmark.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="sans text-xs bg-danger-muted text-danger border border-danger-border px-4 py-2 rounded transition hover:opacity-90"
          >
            {strings.bookmark.deleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
