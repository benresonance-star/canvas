import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { strings } from '../content/strings.js';
import { normalizeBookmarkUrl } from '../lib/bookmarkUrl.js';

export function BookmarkInlineEditor({
  card,
  pinned,
  saving = false,
  disabled = false,
  onSave,
}) {
  const preview = pinned?.bookmarkPreview ?? {};
  const [url, setUrl] = useState(pinned?.externalUrl || '');
  const [title, setTitle] = useState(card?.name || preview.title || '');

  useEffect(() => {
    setUrl(pinned?.externalUrl || '');
    setTitle(card?.name || preview.title || '');
  }, [card?.id, card?.name, pinned?.externalUrl, pinned?.version, preview.title]);

  const normalized = normalizeBookmarkUrl(url);
  const urlDirty = normalized !== (pinned?.externalUrl || '');
  const titleDirty = title.trim() !== (card?.name?.trim() || '');
  const dirty = urlDirty || titleDirty;
  const canSave = dirty && !saving && !disabled && Boolean(normalized);

  const stopBubble = (e) => {
    e.stopPropagation();
  };

  const open = () => {
    const target = normalized || pinned?.externalUrl;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="h-full w-full min-h-0 flex flex-col gap-2"
      data-card-interactive-edit
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      <label className="block shrink-0">
        <span className="sans text-[9px] uppercase tracking-wider text-muted">
          {strings.bookmark.url}
        </span>
        <input
          type="url"
          value={url}
          disabled={disabled || saving}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-0.5 w-full sans text-[11px] bg-surface border border-border rounded px-2 py-1 text-primary disabled:opacity-60"
          placeholder={strings.bookmark.urlPlaceholder}
        />
      </label>
      <label className="block shrink-0">
        <span className="sans text-[9px] uppercase tracking-wider text-muted">
          {strings.bookmark.displayTitle}
        </span>
        <input
          type="text"
          value={title}
          disabled={disabled || saving}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-0.5 w-full sans text-[11px] bg-surface border border-border rounded px-2 py-1 text-primary disabled:opacity-60"
        />
      </label>
      <div className="flex-1 min-h-0 overflow-hidden rounded border border-border-subtle bg-surface-muted/30 px-2 py-1.5">
        <div className="serif text-xs text-primary line-clamp-2">
          {preview.title || card.name || strings.bookmark.untitled}
        </div>
        {preview.domain && (
          <div className="sans text-[9px] text-muted truncate mt-0.5">{preview.domain}</div>
        )}
      </div>
      <div className="shrink-0 flex justify-end gap-1 pt-1 border-t border-border-subtle">
        <button
          type="button"
          disabled={!normalized}
          onClick={(e) => {
            stopBubble(e);
            open();
          }}
          className="sans text-[10px] text-accent flex items-center gap-1 px-2 py-0.5 disabled:opacity-40"
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          {strings.bookmark.open}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={(e) => {
            stopBubble(e);
            if (canSave) {
              void onSave?.({ url: normalized, title: title.trim() });
            }
          }}
          className="sans text-[10px] bg-accent text-on-accent px-2 py-0.5 rounded disabled:opacity-40"
        >
          {saving ? strings.bookmark.savingEdit : strings.bookmark.saveEdit}
        </button>
      </div>
    </div>
  );
}
