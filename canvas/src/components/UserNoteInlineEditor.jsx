import React, { useState } from 'react';
import { strings } from '../content/strings.js';
import { markdownViewToggleLabel } from '../lib/markdownMessage.js';
import { MarkdownMessage } from './MarkdownMessage.jsx';

export function UserNoteInlineEditor({
  content,
  initialTitle,
  title,
  disabled,
  saving,
  onSave,
}) {
  const contentValue = content ?? '';
  const [lastContentValue, setLastContentValue] = useState(contentValue);
  const [body, setBody] = useState(contentValue);
  const [formattedView, setFormattedView] = useState(() => Boolean(contentValue));

  if (lastContentValue !== contentValue) {
    setLastContentValue(contentValue);
    setBody(contentValue);
    setFormattedView(Boolean(contentValue));
  }

  const bodyDirty = body !== contentValue;
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
      <div className="shrink-0 flex justify-end px-1 pb-1">
        <button
          type="button"
          className="sans rounded-full border border-border-subtle bg-surface-muted/90 px-2 py-0.5 text-[9px] text-muted shadow-sm hover:text-primary pointer-events-auto"
          onMouseDown={stopBubble}
          onClick={(e) => {
            stopBubble(e);
            setFormattedView((value) => !value);
          }}
          aria-pressed={!formattedView}
        >
          {markdownViewToggleLabel(formattedView)}
        </button>
      </div>
      {formattedView ? (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-1 text-sm text-secondary leading-relaxed">
          {body ? (
            <MarkdownMessage content={body} compact />
          ) : (
            <p className="serif text-muted italic">{strings.userNote.bodyPlaceholder}</p>
          )}
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled || saving}
          className="flex-1 min-h-0 w-full sans text-xs bg-surface border-0 px-1 py-1 text-primary font-serif leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded disabled:opacity-60"
          placeholder={strings.userNote.bodyPlaceholder}
          onMouseDown={stopBubble}
        />
      )}
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
