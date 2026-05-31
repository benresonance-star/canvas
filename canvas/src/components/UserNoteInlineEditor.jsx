import React, { useEffect, useState } from 'react';
import { strings } from '../content/strings.js';

export function UserNoteInlineEditor({
  content,
  initialTitle,
  title,
  disabled,
  saving,
  onSave,
}) {
  const [body, setBody] = useState(content ?? '');

  useEffect(() => {
    setBody(content ?? '');
  }, [content]);

  const bodyDirty = body !== (content ?? '');
  const titleDirty = (title ?? '') !== (initialTitle ?? '');
  const dirty = bodyDirty || titleDirty;
  const canSave = dirty && !saving && !disabled;

  const stopBubble = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className="h-full w-full min-h-0 flex flex-col"
      data-artifact-scroll
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={disabled || saving}
        className="flex-1 min-h-0 w-full sans text-xs bg-surface border-0 px-1 py-1 text-primary font-serif leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded disabled:opacity-60"
        placeholder={strings.userNote.bodyPlaceholder}
        onMouseDown={stopBubble}
      />
      <div className="shrink-0 flex justify-end gap-1 pt-1 border-t border-border-subtle">
        <button
          type="button"
          disabled={!canSave}
          onMouseDown={stopBubble}
          onClick={(e) => {
            stopBubble(e);
            if (canSave) onSave?.({ body, name: title ?? initialTitle ?? '' });
          }}
          className="sans text-[10px] bg-accent text-on-accent px-2 py-0.5 rounded disabled:opacity-40 pointer-events-auto"
        >
          {saving ? strings.userNote.saving : strings.userNote.saveOnCard}
        </button>
      </div>
    </div>
  );
}
