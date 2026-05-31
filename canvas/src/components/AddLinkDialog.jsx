import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { strings } from '../content/strings.js';
import { cardTypeLabel } from '../lib/filename.js';
import { normalizeBookmarkUrl } from '../lib/bookmarkUrl.js';
import { fetchBookmarkPreview } from '../lib/bookmarkPreviewApi.js';
import { BookmarkPreview } from './BookmarkPreview.jsx';

export function AddLinkDialog({
  onClose,
  onSave,
  saving,
  linkableCards = [],
}) {
  const [url, setUrl] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const normalized = useMemo(() => normalizeBookmarkUrl(url), [url]);

  useEffect(() => {
    if (!normalized) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      const result = await fetchBookmarkPreview(normalized);
      if (cancelled) return;
      setPreviewLoading(false);
      if (!result.url) {
        setPreviewError(result.error || strings.bookmark.previewFailed);
        setPreview(null);
        return;
      }
      setPreview(result);
      setPreviewError(result.error || null);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized]);

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
    if (!normalized || !preview) return;
    const linkTargetRefs = targets
      .filter((t) => selectedCardIds.has(t.cardId))
      .map((t) => t.artifactRef);
    onSave({
      url: normalized,
      preview,
      titleOverride: titleOverride.trim(),
      linkTargetRefs,
    });
  };

  const mockPinned = preview
    ? {
        externalUrl: preview.url || normalized,
        bookmarkPreview: {
          title: titleOverride.trim() || preview.title,
          description: preview.description,
          imageUrl: preview.imageUrl,
          siteName: preview.siteName,
          domain: preview.domain,
          fetchedAt: new Date().toISOString(),
        },
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl flex flex-col max-h-[85vh]"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="sans text-xs uppercase tracking-wider text-primary">{strings.bookmark.title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary p-1">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.bookmark.url}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder={strings.bookmark.urlPlaceholder}
              className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
            />
          </label>
          {normalized && (
            <label className="block">
              <span className="sans text-[10px] uppercase tracking-wider text-muted">{strings.bookmark.displayTitle}</span>
              <input
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder={preview?.title || ''}
                className="mt-1 w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary"
              />
            </label>
          )}
          <div className="rounded border border-border-subtle bg-canvas/50 p-2 min-h-[8rem]">
            {previewLoading && (
              <p className="sans text-xs text-muted text-center py-8">{strings.bookmark.previewLoading}</p>
            )}
            {!previewLoading && !normalized && (
              <p className="sans text-xs text-muted text-center py-8">{strings.bookmark.enterUrl}</p>
            )}
            {!previewLoading && normalized && mockPinned && (
              <div className="h-40">
                <BookmarkPreview
                  card={{ name: titleOverride || preview.title, type: 'bookmark' }}
                  pinned={mockPinned}
                  compact={false}
                />
              </div>
            )}
            {previewError && (
              <p className="sans text-[10px] text-warning mt-2">
                {previewError}
                {!preview?.ok && preview?.url ? ` ${strings.bookmark.previewOffline}` : ''}
              </p>
            )}
          </div>
          {targets.length > 0 && (
            <div>
              <span className="sans text-[10px] uppercase tracking-wider text-muted">
                {strings.graph.linkTargets}
              </span>
              <ul className="mt-2 max-h-32 overflow-y-auto space-y-1 border border-border-subtle rounded p-2">
                {targets.map((t) => (
                  <li key={t.cardId}>
                    <label className="flex items-center gap-2 sans text-xs text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCardIds.has(t.cardId)}
                        onChange={() => toggleTarget(t.cardId)}
                      />
                      <span className="text-muted text-[10px] uppercase">{cardTypeLabel(t.type)}</span>
                      {t.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sans text-xs text-muted px-3 py-1.5">
            {strings.bookmark.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !normalized || !preview || previewLoading}
            className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? strings.bookmark.saving : strings.bookmark.save}
          </button>
        </footer>
      </form>
    </div>
  );
}
