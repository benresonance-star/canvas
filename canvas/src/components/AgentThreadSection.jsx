import React, { useState } from 'react';
import { strings } from '../content/strings.js';

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentThreadSection({
  threads = [],
  activeThreadId,
  activeThreadTitle,
  threadPickerOpen,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onSwitchThread,
  onDeleteThread,
  embedded = false,
}) {
  const sectionClass = embedded
    ? 'shrink-0 px-0 py-1'
    : 'px-4 py-3 border-t border-border shrink-0';
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const showPicker = threadPickerOpen || !activeThreadId;

  if (showPicker) {
    return (
      <section className={sectionClass}>
        <span className="sans text-[10px] uppercase tracking-wider text-muted block mb-2">
          {strings.agent.threadsHeading}
        </span>
        <p className="sans text-[10px] text-muted mb-2">{strings.agent.threadsPickerHint}</p>
        <button
          type="button"
          className="w-full sans text-xs bg-accent text-on-accent rounded px-3 py-2 mb-2 hover:bg-accent-hover transition"
          onClick={() => onCreateThread?.()}
        >
          {strings.agent.threadsNew}
        </button>
        {threads.length === 0 ? (
          <p className="sans text-[10px] text-muted italic">{strings.agent.threadsEmpty}</p>
        ) : (
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {threads.map((t) => (
              <li key={t.threadId}>
                <button
                  type="button"
                  className="w-full text-left rounded border border-border-subtle hover:border-border px-2 py-1.5 transition"
                  onClick={() => onSelectThread?.(t.threadId)}
                >
                  <span className="sans text-xs text-primary block truncate">{t.title}</span>
                  <span className="sans text-[9px] text-muted">
                    {formatRelativeTime(t.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const startRename = () => {
    setRenameDraft(activeThreadTitle || '');
    setRenaming(true);
  };

  const commitRename = () => {
    const trimmed = renameDraft.trim();
    if (trimmed && activeThreadId) {
      onRenameThread?.(activeThreadId, trimmed);
    }
    setRenaming(false);
  };

  return (
    <section className={embedded ? 'shrink-0 px-0 py-1' : 'px-4 py-2 border-t border-border shrink-0'}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          {strings.agent.threadsHeading}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="sans text-[10px] text-link hover:underline"
            onClick={() => onCreateThread?.()}
          >
            {strings.agent.threadsNew}
          </button>
          <button
            type="button"
            className="sans text-[10px] text-link hover:underline"
            onClick={() => onSwitchThread?.()}
          >
            {strings.agent.threadsSwitch}
          </button>
        </div>
      </div>
      {renaming ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <input
            type="text"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            className="flex-1 sans text-xs bg-surface-muted border border-border rounded px-2 py-1 text-primary"
            autoFocus
          />
          <button
            type="submit"
            className="sans text-[10px] text-accent px-2"
          >
            {strings.agent.threadsRenameSave}
          </button>
          <button
            type="button"
            className="sans text-[10px] text-muted px-1"
            onClick={() => setRenaming(false)}
          >
            {strings.agent.apiKeyCancel}
          </button>
        </form>
      ) : (
        <div className="min-w-0" role="status" aria-label={strings.agent.threadsActiveLabel}>
          <p className="sans text-[9px] uppercase tracking-wider text-muted mb-0.5">
            {strings.agent.threadsActiveLabel}
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <span className="sans text-xs text-primary truncate flex-1">
              {activeThreadTitle || activeThreadId}
            </span>
            <button
              type="button"
              className="sans text-[10px] text-muted hover:text-primary shrink-0"
              onClick={startRename}
            >
              {strings.agent.threadsRename}
            </button>
            {onDeleteThread && (
              <button
                type="button"
                className="sans text-[10px] text-muted hover:text-danger shrink-0"
                onClick={() => onDeleteThread?.()}
              >
                {strings.agent.threadsDelete}
              </button>
            )}
          </div>
          {activeThreadId && activeThreadTitle && activeThreadTitle !== activeThreadId && (
            <p className="sans text-[9px] text-muted truncate mt-0.5">{activeThreadId}</p>
          )}
        </div>
      )}
    </section>
  );
}
