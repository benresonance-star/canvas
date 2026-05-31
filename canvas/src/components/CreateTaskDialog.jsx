import React, { useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { createTask } from '../lib/primitivesApi.js';

const TASK_TYPES = ['query', 'check', 'ingest'];

export function CreateTaskDialog({ clusterId, inputRefs = [], onClose, onCreated }) {
  const [intent, setIntent] = useState('');
  const [type, setType] = useState('query');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!intent.trim() || !clusterId) return;
    setSaving(true);
    setError(null);
    try {
      await createTask(clusterId, {
        intent: intent.trim(),
        type,
        status: 'open',
        inputs: inputRefs,
        outputs: [],
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">{strings.task.createTitle}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.task.intent}</span>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              required
              className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
            />
          </label>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.task.type}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          {inputRefs.length > 0 && (
            <p className="sans text-[10px] text-muted">
              {strings.task.linkedInputs(inputRefs.length)}
            </p>
          )}
          {error && <p className="sans text-xs text-danger">{error}</p>}
        </div>
        <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-muted px-3 py-1.5">
            {strings.task.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !intent.trim()}
            className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? strings.task.saving : strings.task.create}
          </button>
        </footer>
      </form>
    </div>
  );
}
