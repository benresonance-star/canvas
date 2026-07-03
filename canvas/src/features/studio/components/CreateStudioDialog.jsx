import React, { useEffect, useState } from 'react';
import { Network, X } from 'lucide-react';
import { listStudioPlaybooks } from '../api/studioApi.js';

export function CreateStudioDialog({ saving = false, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [studioKind, setStudioKind] = useState('domain');
  const [playbookId, setPlaybookId] = useState('builtin_generic_domain_studio');
  const [playbooks, setPlaybooks] = useState([]);

  useEffect(() => {
    let active = true;
    listStudioPlaybooks()
      .then((items) => {
        if (!active) return;
        setPlaybooks(items);
        if (items[0]?.id && !items.some((item) => item.id === playbookId)) {
          setPlaybookId(items[0].id);
          setStudioKind(items[0].studioKind ?? 'domain');
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [playbookId]);

  const canSave = title.trim() && !saving;

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--color-overlay-dialog)] flex items-center justify-center p-6">
      <form
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) {
            void onSave({
              title: title.trim(),
              description: description.trim(),
              studioKind,
              playbookId,
            });
          }
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Network size={17} className="text-accent" />
            <h2 className="serif text-xl text-primary">Create Studio</h2>
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
          placeholder="Cell Mitosis Studio"
        />
        <label className="sans block text-[10px] uppercase tracking-wider text-muted mt-4 mb-1">Playbook</label>
        <select
          value={playbookId}
          onChange={(event) => {
            setPlaybookId(event.target.value);
            const next = playbooks.find((item) => item.id === event.target.value);
            if (next?.studioKind) setStudioKind(next.studioKind);
          }}
          className="sans w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
        >
          {playbooks.length ? playbooks.map((playbook) => (
            <option key={playbook.id} value={playbook.id}>{playbook.title}</option>
          )) : (
            <option value={playbookId}>Generic Domain Studio</option>
          )}
        </select>
        <label className="sans block text-[10px] uppercase tracking-wider text-muted mt-4 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="sans w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
          placeholder="Mission, scope, or first question"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-secondary px-4 py-2 rounded-full hover:bg-surface-muted">Cancel</button>
          <button disabled={!canSave} className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded-full disabled:opacity-40">
            {saving ? 'Creating...' : 'Create Studio'}
          </button>
        </div>
      </form>
    </div>
  );
}
