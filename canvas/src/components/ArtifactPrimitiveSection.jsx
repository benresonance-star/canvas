import React, { useEffect, useState } from 'react';
import { strings } from '../content/strings.js';
import { getPrimitiveDetail } from '../lib/primitivesApi.js';
import { formatDurationSec } from '../lib/audio/parseAudioTags.js';
import { FieldRow } from './FieldRow.jsx';
import { ImageArtifactMetadataFields } from './ImageArtifactMetadataFields.jsx';

export function ArtifactPrimitiveSection({ artifactRef, version = null, variant = 'sidebar' }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    if (!artifactRef?.id) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPrimitiveDetail('artifact', artifactRef.id);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifactRef?.id]);

  if (!artifactRef?.id) return null;

  const p = detail?.primitive;
  const meta =
    p?.metadata && typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p?.metadata;

  return (
    <section
      className={
        isSidebar
          ? 'shrink-0 border-b border-border px-4 py-3'
          : 'shrink-0 border-t border-border bg-surface px-6 py-4'
      }
    >
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
        {strings.modal.artifactPrimitive}
      </div>
      {loading && (
        <p className="sans text-xs text-muted italic">{strings.inspector.loading}</p>
      )}
      {error && <p className="sans text-xs text-danger">{error}</p>}
      {!loading && !error && p && (
        <>
          <FieldRow label="URI" value={p.uri} />
          <FieldRow label="Hash" value={p.content_hash} />
          <FieldRow label="Type" value={p.type} />
          <FieldRow label="File" value={meta?.filename} />
          <ImageArtifactMetadataFields meta={meta} version={version} />
          {meta?.canvas_kind === 'audio' && meta?.audio && (
            <>
              <FieldRow label={strings.audio.title} value={meta.audio.title} />
              <FieldRow label={strings.audio.artist} value={meta.audio.artist} />
              <FieldRow label={strings.audio.album} value={meta.audio.album} />
              <FieldRow
                label={strings.audio.duration}
                value={
                  meta.audio.durationSec != null
                    ? formatDurationSec(meta.audio.durationSec)
                    : null
                }
              />
              <FieldRow label={strings.audio.genre} value={meta.audio.genre} />
              <FieldRow label={strings.audio.year} value={meta.audio.year} />
              <FieldRow label={strings.audio.track} value={meta.audio.track} />
            </>
          )}
        </>
      )}
    </section>
  );
}
