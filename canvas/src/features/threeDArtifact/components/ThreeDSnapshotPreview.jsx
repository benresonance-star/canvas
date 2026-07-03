import React, { useEffect, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { ThreeDModelSummary } from './ThreeDModelSummary.jsx';

export function ThreeDSnapshotPreview({
  cacheKey,
  card,
  version,
  compact = false,
  feasibility = null,
  warnHeavy = false,
}) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(Boolean(cacheKey));

  useEffect(() => {
    if (!cacheKey) {
      setSrc(null);
      setLoading(false);
      return undefined;
    }

    let objectUrl = null;
    let cancelled = false;
    setLoading(true);

    void getPreview(cacheKey).then((blob) => {
      if (cancelled) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } else {
        setSrc(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cacheKey]);

  if (loading) {
    return (
      <div className="h-full w-full min-h-0 flex items-center justify-center bg-preview-bg">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Loading preview</div>
      </div>
    );
  }

  if (!src) {
    return (
      <ThreeDModelSummary
        card={card}
        version={version}
        compact={compact}
        feasibility={feasibility}
        warnHeavy={warnHeavy}
      />
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex items-center justify-center bg-preview-bg overflow-hidden">
      <img
        src={src}
        alt={card?.name || '3D model preview'}
        draggable={false}
        className="max-h-full max-w-full w-full h-full object-contain select-none"
      />
    </div>
  );
}
