import React, { useState } from 'react';
import { strings } from '../content/strings.js';
import { markdownViewToggleLabel } from '../lib/markdownMessage.js';
import { EditableMarkdownMessage } from './EditableMarkdownMessage.jsx';

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

  const viewToggleButton = (nextFormattedView) => (
    <button
      type="button"
      className="sans rounded-full border border-border-subtle bg-surface-muted/90 px-2 py-0.5 text-[9px] text-muted shadow-sm hover:text-primary pointer-events-auto"
      onMouseDown={stopBubble}
      onClick={(e) => {
        stopBubble(e);
        setFormattedView(nextFormattedView);
      }}
      aria-pressed={!nextFormattedView}
    >
      {markdownViewToggleLabel(nextFormattedView)}
    </button>
  );

  return (
    <div
      className="h-full w-full min-h-0 flex flex-col"
      data-artifact-scroll
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      <div className="flex-1 min-h-0 flex flex-col px-1 py-1 text-sm text-secondary leading-relaxed select-text">
        {formattedView ? (
          <EditableMarkdownMessage
            value={body}
            onChange={setBody}
            compact
            disabled={disabled || saving}
            toolbarRight={viewToggleButton(formattedView)}
          />
        ) : (
          <>
            <div className="shrink-0 flex justify-end pb-1">
              {viewToggleButton(formattedView)}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={disabled || saving}
              className="flex-1 min-h-0 w-full sans text-xs bg-surface border-0 px-1 py-1 text-primary font-serif leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 rounded disabled:opacity-60 cursor-text"
              placeholder={strings.userNote.bodyPlaceholder}
              onMouseDown={stopBubble}
            />
          </>
        )}
      </div>
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
