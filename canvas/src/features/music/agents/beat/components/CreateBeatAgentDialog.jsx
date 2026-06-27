import React, { useState } from 'react';

export function CreateBeatAgentDialog({ saving = false, onClose, onSave }) {
  const [name, setName] = useState('Beat Agent');
  const [error, setError] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-overlay)] backdrop-blur-sm flex items-center justify-center p-6">
      <form
        className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          void Promise.resolve(onSave({ name: name.trim() || 'Beat Agent' }))
            .then((card) => {
              if (!card) setError('Could not create Beat Agent for the current project.');
            })
            .catch((err) => {
              setError(err?.message || 'Could not create Beat Agent.');
            });
        }}
      >
        <h2 className="serif text-xl text-primary mb-4">Create Beat Agent</h2>
        <label className="sans text-[10px] uppercase tracking-wider text-muted block mb-1">
          Name
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm text-primary mb-4"
          autoFocus
        />
        {error && (
          <div className="sans text-xs text-danger bg-danger-muted border border-danger-border rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs px-3 py-2 text-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
