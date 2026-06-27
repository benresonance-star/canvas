import React, { useState } from 'react';
import { Workflow, X } from 'lucide-react';
import { strings } from '../../../content/strings.js';

export function CreateFlowDialog({ saving = false, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const canSave = title.trim() && !saving;
  return (
    <div className="fixed inset-0 z-[70] bg-[var(--color-overlay-dialog)] flex items-center justify-center p-6">
      <form
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void onSave({ title: title.trim(), description: description.trim() });
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Workflow size={17} className="text-accent" />
            <h2 className="serif text-xl text-primary">{strings.flow.createTitle}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label className="sans block text-[10px] uppercase tracking-wider text-muted mb-1">Name</label>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="sans w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
          placeholder="Customer onboarding"
        />
        <label className="sans block text-[10px] uppercase tracking-wider text-muted mt-4 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="sans w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
          placeholder={strings.flow.createDescriptionPlaceholder}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-secondary px-4 py-2 rounded-full hover:bg-surface-muted">Cancel</button>
          <button disabled={!canSave} className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded-full disabled:opacity-40">
            {saving ? strings.flow.creating : strings.flow.createButton}
          </button>
        </div>
      </form>
    </div>
  );
}
