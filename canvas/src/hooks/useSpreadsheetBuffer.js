import { useEffect, useState } from 'react';
import { getPreview } from '../lib/previewStore.js';
import { strings } from '../content/strings.js';

export function useSpreadsheetBuffer({ card, pinned, onRehydratePreview }) {
  const [buffer, setBuffer] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let createdBlobUrl = null;

    (async () => {
      setError(null);
      setBuffer(null);
      setBlobUrl(null);
      setLoading(true);

      try {
        let buf = null;
        let resolvedBlobUrl = pinned.objectUrl || null;

        if (pinned.previewCacheKey) {
          const blob = await getPreview(pinned.previewCacheKey);
          if (blob) {
            buf = await blob.arrayBuffer();
            if (!resolvedBlobUrl) {
              createdBlobUrl = URL.createObjectURL(blob);
              resolvedBlobUrl = createdBlobUrl;
            }
          }
        }

        if (!buf && pinned.objectUrl) {
          const res = await fetch(pinned.objectUrl);
          buf = await res.arrayBuffer();
          resolvedBlobUrl = pinned.objectUrl;
        }

        if (!buf && pinned.dataUrl) {
          const res = await fetch(pinned.dataUrl);
          buf = await res.arrayBuffer();
        }

        if (!buf && pinned.previewCacheKey && onRehydratePreview) {
          await onRehydratePreview(card.id, pinned.version, { force: true });
          const blob = await getPreview(pinned.previewCacheKey);
          if (blob) {
            buf = await blob.arrayBuffer();
            if (!resolvedBlobUrl) {
              createdBlobUrl = URL.createObjectURL(blob);
              resolvedBlobUrl = createdBlobUrl;
            }
          }
        }

        if (!buf) {
          if (!cancelled) {
            setError(strings.preview.notInProject);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setBuffer(buf);
          setBlobUrl(resolvedBlobUrl);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || strings.preview.tooLarge);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [card.id, pinned, onRehydratePreview]);

  return {
    buffer,
    blobUrl,
    error,
    loading,
    fileName: pinned?.filename || 'workbook.xlsx',
  };
}
