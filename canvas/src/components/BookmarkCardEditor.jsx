import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { strings } from '../content/strings.js';
import { normalizeBookmarkUrl } from '../lib/bookmarkUrl.js';
import { bookmarkEmbedPreviewUrl, fetchBookmarkPreview } from '../lib/bookmarkPreviewApi.js';

export function BookmarkCardEditor({
  card,
  version,
  saving = false,
  disabled = false,
  onSave,
}) {
  const pinned = version;
  const previewState = pinned?.bookmarkPreview ?? {};
  const [url, setUrl] = useState(pinned?.externalUrl || '');
  const [title, setTitle] = useState(card?.name || previewState.title || '');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    setUrl(pinned?.externalUrl || '');
    setTitle(card?.name || previewState.title || '');
    setPreview(null);
    setPreviewError(null);
  }, [card?.id, card?.name, pinned?.externalUrl, pinned?.version, previewState.title]);

  const normalized = useMemo(() => normalizeBookmarkUrl(url), [url]);

  useEffect(() => {
    if (!normalized || normalized === pinned?.externalUrl) {
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
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, pinned?.externalUrl]);

  const urlDirty = normalized !== (pinned?.externalUrl || '');
  const titleDirty = title.trim() !== (card?.name?.trim() || '');
  const dirty = urlDirty || titleDirty;
  const canSave = dirty && !saving && !disabled && Boolean(normalized);
  const canRefreshPreview = !saving && !disabled && Boolean(normalized);
  const embedUrl = useMemo(() => bookmarkEmbedPreviewUrl(normalized), [normalized]);

  const mockPinned = {
    externalUrl: normalized || pinned?.externalUrl,
    bookmarkPreview: preview
      ? {
          title: title.trim() || preview.title,
          description: preview.description,
          imageUrl: preview.imageUrl,
          siteName: preview.siteName,
          domain: preview.domain,
          fetchedAt: new Date().toISOString(),
        }
      : pinned?.bookmarkPreview,
  };

  const open = () => {
    const target = normalized || pinned?.externalUrl;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  };

  const refreshPreview = async () => {
    if (!canRefreshPreview) return;
    setPreviewLoading(true);
    setPreviewError(null);
    const result = await fetchBookmarkPreview(normalized);
    setPreviewLoading(false);
    if (!result.url) {
      setPreviewError(result.error || strings.bookmark.previewFailed);
      return;
    }
    setPreview(result);
    if (result.error) setPreviewError(result.error);
    await onSave?.({
      url: normalized,
      title: title.trim(),
      preview: result,
    });
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-6 gap-4" data-card-interactive-edit>
      <label className="block">
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          {strings.bookmark.url}
        </span>
        <input
          type="url"
          value={url}
          disabled={disabled || saving}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full sans text-sm bg-surface border border-border rounded px-3 py-2 text-primary disabled:opacity-60"
        />
      </label>
      <label className="block">
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          {strings.bookmark.displayTitle}
        </span>
        <input
          type="text"
          value={title}
          disabled={disabled || saving}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full sans text-sm bg-surface border border-border rounded px-3 py-2 text-primary disabled:opacity-60"
        />
      </label>
      <div className="flex-1 min-h-[12rem] rounded border border-border bg-surface-muted/30 overflow-hidden">
        {previewLoading && (
          <p className="sans text-xs text-muted text-center py-8">{strings.bookmark.previewLoading}</p>
        )}
        {!previewLoading && embedUrl && (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={title || card.name || strings.bookmark.untitled}
            sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
          />
        )}
        {!previewLoading && !normalized && mockPinned?.bookmarkPreview && (
          <div className="h-full flex items-center justify-center px-4 text-center">
            <p className="sans text-xs text-muted">{strings.bookmark.enterUrl}</p>
          </div>
        )}
        {previewError && (
          <p className="sans text-xs text-warning mt-2">{previewError}</p>
        )}
      </div>
      <footer className="shrink-0 flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={!normalized}
          onClick={open}
          className="sans text-xs text-accent flex items-center gap-1.5 px-3 py-1.5"
        >
          <ExternalLink size={14} strokeWidth={1.5} />
          {strings.bookmark.open}
        </button>
        <button
          type="button"
          disabled={!canRefreshPreview || previewLoading}
          onClick={() => {
            void refreshPreview();
          }}
          className="sans text-xs text-accent px-3 py-1.5 rounded border border-border-subtle disabled:opacity-50"
        >
          {previewLoading ? strings.bookmark.refreshingPreview : strings.bookmark.refreshPreview}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!canSave) return;
            void onSave?.({
              url: normalized,
              title: title.trim(),
              preview: preview ?? undefined,
            });
          }}
          className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
        >
          {saving ? strings.bookmark.savingEdit : strings.bookmark.saveEdit}
        </button>
      </footer>
    </div>
  );
}
