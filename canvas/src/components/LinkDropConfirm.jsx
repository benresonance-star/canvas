import React, { useState } from 'react';
import { strings } from '../content/strings.js';

const REL_TYPES = ['references', 'part_of'];

export function LinkDropConfirm({ targetName, onConfirm, onCancel }) {
  const [relType, setRelType] = useState('references');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onCancel} />
      <div className="relative bg-surface border border-border rounded-lg shadow-2xl p-4 w-full max-w-xs">
        <p className="sans text-xs text-primary mb-3">
          {strings.graph.linkConfirm(targetName)}
        </p>
        <label className="block mb-3">
          <span className="sans text-[10px] uppercase tracking-wider text-muted">
            {strings.graph.relationType}
          </span>
          <select
            value={relType}
            onChange={(e) => setRelType(e.target.value)}
            className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5"
          >
            {REL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="sans text-xs text-muted px-3 py-1.5">
            {strings.userNote.cancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(relType)}
            className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded"
          >
            {strings.linkArtifact.link}
          </button>
        </div>
      </div>
    </div>
  );
}
