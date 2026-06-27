import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { cardTypeLabel } from '../lib/filename.js';
import { USER_TASK_STATUSES } from '../features/tasks/domain/userTaskContent.js';

export function NewTaskDialog({ onClose, onSave, saving, linkableCards = [] }) {
  const [prefix, setPrefix] = useState('tasks');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [taskStatus, setTaskStatus] = useState('general');
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());

  const targets = useMemo(() => {
    return linkableCards
      .map((c) => {
        const pinned =
          c.versions?.find((v) => v.version === c.pinnedVersion) || c.versions?.[0];
        return {
          cardId: c.id,
          name: c.name,
          type: c.type,
          artifactRef: pinned?.artifactRef,
        };
      })
      .filter((t) => t.artifactRef?.id);
  }, [linkableCards]);

  const toggleTarget = (cardId) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const linkTargetRefs = targets
      .filter((t) => selectedCardIds.has(t.cardId))
      .map((t) => t.artifactRef);
    onSave({
      prefix: prefix.trim() || 'tasks',
      name: name.trim(),
      body,
      taskStatus,
      linkTargetRefs,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl flex flex-col max-h-[85vh]"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">{strings.userTask.title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <fieldset>
            <legend className="sans text-[10px] uppercase tracking-wider text-muted">{strings.userTask.status}</legend>
            <div className="mt-2 flex gap-3">
              {USER_TASK_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-1.5 sans text-xs text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="taskStatus"
                    value={status}
                    checked={taskStatus === status}
                    onChange={() => setTaskStatus(status)}
                  />
                  {status === 'important' ? strings.userTask.statusImportant : strings.userTask.statusGeneral}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.userTask.prefix}</span>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
              />
            </label>
            <label className="flex-[2]">
              <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.userTask.name}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.userTask.body}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary font-serif leading-relaxed resize-y min-h-[8rem]"
              placeholder={strings.userTask.bodyPlaceholder}
            />
          </label>
          {targets.length > 0 && (
            <div>
              <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.graph.linkTargets}</span>
              <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {targets.map((t) => (
                  <li key={t.cardId}>
                    <label className="flex items-center gap-2 sans text-xs text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCardIds.has(t.cardId)}
                        onChange={() => toggleTarget(t.cardId)}
                      />
                      <span>{t.name}</span>
                      <span className="text-muted">({cardTypeLabel(t.type)})</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="sans text-xs text-muted px-3 py-1.5">
            {strings.userTask.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? strings.userTask.saving : strings.userTask.save}
          </button>
        </footer>
      </form>
    </div>
  );
}
