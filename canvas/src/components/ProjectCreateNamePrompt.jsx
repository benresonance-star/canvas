import React, { useState, useEffect, useRef } from 'react';
import { strings } from '../content/strings.js';

export function ProjectCreateNamePrompt({ defaultName, onConfirm, onCancel }) {
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    const trimmed = name.trim() || strings.defaultProjectName;
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-[var(--color-overlay-dialog)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-title"
        className="bg-surface rounded-lg w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <div id="project-create-title" className="serif text-lg text-primary">
            {strings.projects.createTitle}
          </div>
          <label className="block mt-3">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.projects.createNameLabel}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape' && !submitting) {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="mt-1 w-full sans text-sm text-primary bg-surface-muted border border-border rounded px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-60"
            />
          </label>
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-2 bg-surface-muted">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="sans text-xs text-secondary hover:text-primary px-3 py-2 transition disabled:opacity-50"
          >
            {strings.projects.cancel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="sans text-xs bg-accent-muted text-accent border border-accent-border px-4 py-2 rounded transition hover:opacity-90 disabled:opacity-50"
          >
            {strings.projects.createConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
