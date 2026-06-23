import React, { useEffect, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { fetchAgentTypes } from '../api/agentsApi.js';
import { IMAGE_GENERATION_AGENT_TYPE_ID, DEFAULT_IMAGE_AGENT_SETTINGS } from '../domain/agentArtifact.js';

export function CreateAgentDialog({ saving = false, onClose, onSave }) {
  const [agentTypes, setAgentTypes] = useState([]);
  const [agentTypeId, setAgentTypeId] = useState(IMAGE_GENERATION_AGENT_TYPE_ID);
  const [name, setName] = useState('Image Generation Agent');
  const [goal, setGoal] = useState('Create useful image outputs from Canvas notes and references.');
  const [description, setDescription] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchAgentTypes()
      .then((types) => {
        if (cancelled) return;
        setAgentTypes(types);
        const first = types[0];
        if (first) {
          setAgentTypeId(first.id);
          setName(first.name);
          setGoal(first.defaultGoal ?? goal);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    onSave({
      agentTypeId,
      name,
      description,
      goal,
      transformerSettings: DEFAULT_IMAGE_AGENT_SETTINGS,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xl bg-surface border border-border rounded-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bot size={16} />
            <h2 className="sans text-sm text-primary">Create Agent</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-muted hover:text-primary">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">Type</span>
            <select
              value={agentTypeId}
              onChange={(event) => setAgentTypeId(event.target.value)}
              className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm text-primary"
            >
              {agentTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm text-primary"
            />
          </label>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm text-primary resize-none"
            />
          </label>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">Goal</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={3}
              className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm text-primary resize-none"
            />
          </label>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs px-3 py-2 text-secondary hover:text-primary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
