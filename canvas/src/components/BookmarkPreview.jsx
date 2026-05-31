import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { strings } from '../content/strings.js';
import { getPreview } from '../lib/previewStore.js';

/**
 * Notion-style static bookmark card (snapshot at add time).
 */
export function BookmarkPreview({
  card,
  pinned,
  compact = false,
  onOpen,
}) {
  const preview = pinned?.bookmarkPreview ?? {};
  const url = pinned?.externalUrl || '';
  const [thumbSrc, setThumbSrc] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      if (pinned?.objectUrl) {
        if (!cancelled) setThumbSrc(pinned.objectUrl);
        return;
      }
      if (pinned?.previewCacheKey) {
        const blob = await getPreview(pinned.previewCacheKey);
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setThumbSrc(objectUrl);
          return;
        }
      }
      if (!cancelled) setThumbSrc(preview.imageUrl || null);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pinned?.objectUrl, pinned?.previewCacheKey, preview.imageUrl]);

  const title = preview.title || card.name || preview.domain || strings.bookmark.untitled;
  const domain = preview.domain || '';
  const description = preview.description || '';

  const open = () => {
    if (onOpen) onOpen(url);
    else if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const titleClass = compact ? 'text-xs' : 'text-sm';
  const domainClass = compact ? 'text-[9px]' : 'text-[10px]';
  const descClass = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className="h-full w-full min-h-0 flex flex-col text-left overflow-hidden rounded-md border border-border-subtle bg-surface-muted/40 group">
      <div
        className={`shrink-0 w-full bg-surface-muted overflow-hidden ${
          compact ? 'h-16' : 'h-28'
        }`}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center sans text-[10px] text-muted uppercase tracking-wider">
            {domain || strings.bookmark.link}
          </div>
        )}
      </div>
      <div className={`flex-1 min-h-0 flex flex-col px-3 py-2 gap-0.5 ${compact ? 'py-1.5' : ''}`}>
        <div className={`serif text-primary line-clamp-2 leading-snug ${titleClass}`}>
          {title}
        </div>
        {domain && (
          <div className={`sans text-muted truncate ${domainClass}`}>{domain}</div>
        )}
        {!compact && description && (
          <div className={`sans text-secondary line-clamp-2 mt-0.5 ${descClass}`}>
            {description}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`sans text-accent flex items-center gap-1 mt-auto pt-1 self-start opacity-0 group-hover:opacity-100 transition pointer-events-auto ${
            compact ? 'text-[9px]' : 'text-[10px]'
          }`}
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          {strings.bookmark.open}
        </button>
      </div>
    </div>
  );
}
