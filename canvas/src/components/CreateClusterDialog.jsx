import React, { useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';

export function CreateClusterDialog({
  onClose,
  onSave,
  saving,
  selectedCount = 0,
  syncableCount = 0,
}) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || syncableCount < 1) return;
    onSave({ name: name.trim(), purpose: purpose.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">
            {strings.cluster.createFromSelection}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>
        <div className="px-4 py-3 space-y-3">
          <p className="sans text-xs text-muted">
            {strings.cluster.selectionSummary(selectedCount, syncableCount)}
          </p>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.cluster.name}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full sans text-sm bg-surface border border-border rounded px-2 py-1.5 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.cluster.purpose}
            </span>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="mt-1 w-full sans text-sm bg-surface border border-border rounded px-2 py-1.5 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </label>
          {syncableCount < 1 && (
            <p className="sans text-xs text-danger">{strings.cluster.noArtifactsSelected}</p>
          )}
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="sans text-xs text-muted hover:text-primary px-3 py-1.5"
          >
            {strings.userNote.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || syncableCount < 1}
            className="sans text-xs bg-accent text-on-accent px-3 py-1.5 rounded disabled:opacity-40"
          >
            {saving ? strings.cluster.creating : strings.cluster.create}
          </button>
        </footer>
      </form>
    </div>
  );
}
