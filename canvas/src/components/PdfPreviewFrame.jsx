import React, { useState, useEffect } from 'react';
import { PDF_IFRAME_DATA_URL_MAX_CHARS } from '../lib/constants.js';
import { pdfEmbedSrc } from '../lib/pdfEmbedSrc.js';
import { strings } from '../content/strings.js';

export function PdfPreviewFrame({ mediaSrc, iframeKey, title, pointerEventsNone }) {
  const needsBlob = Boolean(mediaSrc?.startsWith('data:') && mediaSrc.length > PDF_IFRAME_DATA_URL_MAX_CHARS);
  const [displaySrc, setDisplaySrc] = useState(() => (needsBlob ? null : mediaSrc));

  useEffect(() => {
    if (!mediaSrc) {
      setDisplaySrc(null);
      return undefined;
    }
    if (!mediaSrc.startsWith('data:') || mediaSrc.length <= PDF_IFRAME_DATA_URL_MAX_CHARS) {
      setDisplaySrc(mediaSrc);
      return undefined;
    }
    let cancelled = false;
    let objectUrl;
    fetch(mediaSrc)
      .then(r => r.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(mediaSrc);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaSrc]);

  if (!mediaSrc) return null;

  if (needsBlob && displaySrc === null) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center px-2">
        <div className="serif text-secondary text-sm mb-1">{strings.preview.loadingPdf}</div>
        <div className="sans text-[10px] text-muted">{strings.preview.loadingPdfHint}</div>
      </div>
    );
  }

  const src = pdfEmbedSrc(displaySrc ?? mediaSrc);

  return (
    <div className="h-full w-full min-h-0 flex flex-col">
      <iframe
        key={iframeKey}
        src={src}
        className={`w-full h-full border-0 bg-preview-bg ${pointerEventsNone ? 'pointer-events-none' : ''}`}
        title={title}
      />
    </div>
  );
}