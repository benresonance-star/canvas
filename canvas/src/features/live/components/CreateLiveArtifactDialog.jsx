import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchLiveModelOptions } from '../api/liveApi.js';

export function CreateLiveArtifactDialog({ saving, onClose, onSave }) {
  const [name, setName] = useState('Melbourne Development Feed');
  const [description, setDescription] = useState('A live agent-maintained project feed.');
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('gpt-4o-mini');
  const [reasoningEffort, setReasoningEffort] = useState('');
  useEffect(() => { void fetchLiveModelOptions().then(setModels).catch(() => {}); }, []);
  const selected = models.find((entry) => entry.model === model);
  return (
    <div className="fixed inset-0 z-[70] bg-[var(--color-overlay)] flex items-center justify-center p-4">
      <form className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl p-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void onSave({ name, description, kind: 'agent_feed', model, reasoningEffort: reasoningEffort || null }); }}>
        <div className="flex justify-between items-center"><div><div className="sans text-[10px] tracking-wider text-accent">LIVE · AGENT FEED</div><h2 className="serif text-xl">Create live artifact</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <label className="block sans text-xs text-secondary">Name<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-primary" /></label>
        <label className="block sans text-xs text-secondary">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full bg-surface-muted border border-border rounded px-3 py-2 text-primary" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="sans text-xs text-secondary">Model<select value={model} onChange={(e) => { setModel(e.target.value); setReasoningEffort(''); }} className="mt-1 w-full bg-surface-muted border border-border rounded px-2 py-2">{(models.length ? models : [{ model: 'gpt-4o-mini', label: 'GPT-4o mini' }]).map((entry) => <option key={entry.model} value={entry.model}>{entry.label}</option>)}</select></label>
          <label className="sans text-xs text-secondary">Reasoning<select disabled={!selected?.reasoningEfforts?.length} value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)} className="mt-1 w-full bg-surface-muted border border-border rounded px-2 py-2 disabled:opacity-50"><option value="">Default</option>{(selected?.reasoningEfforts || []).map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="sans text-xs px-4 py-2">Cancel</button><button disabled={saving} className="sans text-xs bg-accent text-on-accent px-4 py-2 rounded disabled:opacity-50">{saving ? 'Creating…' : 'Create live artifact'}</button></div>
      </form>
    </div>
  );
}
