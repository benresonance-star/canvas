import React from 'react';
import { strings } from '../content/strings.js';

export function SyncConfirm({ changes, applyMode = 'merge', onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--color-overlay-dialog)] backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="bg-surface rounded-lg w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-border">
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">{strings.syncConfirm.label}</div>
          <div className="serif text-lg text-primary">{strings.syncConfirm.changesFound(changes.length)}</div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {changes.map((change, i) => (
            <div key={i} className="px-6 py-3 border-b border-border-subtle last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="serif text-sm text-primary truncate">{change.group.parsed.name}</div>
                  <div className="sans text-[10px] text-muted">{change.group.parsed.prefix}</div>
                </div>
                <div className="sans text-[10px] flex-shrink-0">
                  {change.type === 'new' ? (
                    <span className="text-success bg-success-muted px-2 py-0.5 rounded">{strings.syncConfirm.new}</span>
                  ) : (
                    <span className="text-accent bg-surface-muted px-2 py-0.5 rounded">
                      {strings.syncConfirm.versionsAdded(change.newVersions.length)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-2 bg-surface-muted">
          <button onClick={onCancel} className="sans text-xs text-secondary hover:text-primary px-3 py-2 transition">
            {strings.syncConfirm.cancel}
          </button>
          <button onClick={onConfirm} className="sans text-xs bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded transition">
            {strings.syncConfirm.apply}
          </button>
        </div>
        <div className="px-6 pb-4">
          <p className="serif italic text-[11px] text-muted leading-relaxed">
            {applyMode === 'replace' ? strings.syncConfirm.replaceHint : strings.syncConfirm.mergeHint}
          </p>
        </div>
      </div>
    </div>
  );
}
