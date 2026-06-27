import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export function CreateSonicStudioDialog({ saving = false, onClose, onSave }) {
  const [name, setName] = useState('Sonic Studio');
  const [error, setError] = useState('');
  const canSave = !saving && name.trim();

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--color-overlay-dialog)] flex items-center justify-center p-6">
      <form
        className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          setError('');
          void Promise.resolve(onSave({ name: name.trim() }))
            .then((card) => {
              if (!card) setError('Could not create Sonic Studio for the current project.');
            })
            .catch((err) => {
              setError(err?.message || 'Could not create Sonic Studio.');
            });
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={17} className="text-accent" />
            <h2 className="serif text-xl text-primary">Create Sonic Studio</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label className="sans block text-[10px] uppercase tracking-wider text-muted mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="sans w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
        />
        {error && (
          <div className="sans text-xs text-danger bg-danger-muted border border-danger-border rounded px-3 py-2 mt-4">
            {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-secondary px-4 py-2 rounded hover:bg-surface-muted">
            Cancel
          </button>
          <button disabled={!canSave} className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded disabled:opacity-40">
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
