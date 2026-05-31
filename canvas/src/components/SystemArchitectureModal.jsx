import React, { useState, useMemo, useCallback } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { strings } from '../content/strings.js';
import {
  ARCHITECTURE_SPEC_VERSION,
  ARCHITECTURE_FEATURES,
  ARCHITECTURE_ENTITY_STORAGE,
  buildArchitectureMarkdown,
} from '../lib/systemArchitectureSpec.js';
import { ArchitectureDiagramView } from './ArchitectureDiagramView.jsx';

/**
 * @param {{
 *   onClose: () => void,
 *   runtime?: object,
 * }} props
 */
export function SystemArchitectureModal({ onClose, runtime }) {
  const [highlightedFeatureId, setHighlightedFeatureId] = useState(null);
  const [copyState, setCopyState] = useState('idle');

  const highlightedLayerIds = useMemo(() => {
    if (!highlightedFeatureId) return new Set();
    const feature = ARCHITECTURE_FEATURES.find((f) => f.id === highlightedFeatureId);
    return new Set(feature?.layerIds ?? []);
  }, [highlightedFeatureId]);

  const markdownPreview = useMemo(
    () => buildArchitectureMarkdown(runtime),
    [runtime],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdownPreview);
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 3000);
    }
  }, [markdownPreview]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={strings.architecture.close}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col pointer-events-auto"
        role="dialog"
        aria-labelledby="architecture-modal-title"
        aria-modal="true"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h2
              id="architecture-modal-title"
              className="sans text-xs uppercase tracking-wider text-primary"
            >
              {strings.architecture.title}
            </h2>
            <p className="sans text-[10px] text-muted mt-0.5">
              {strings.architecture.subtitle(ARCHITECTURE_SPEC_VERSION)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary p-1"
            aria-label={strings.architecture.close}
          >
            <X size={16} />
          </button>
        </header>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          <section>
            <h3 className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.architecture.diagramTitle}
            </h3>
            <ArchitectureDiagramView highlightedLayerIds={highlightedLayerIds} />
          </section>

          <section>
            <h3 className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.architecture.featuresTitle}
            </h3>
            <ul className="space-y-2">
              {ARCHITECTURE_FEATURES.map((f) => {
                const selected = highlightedFeatureId === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setHighlightedFeatureId(selected ? null : f.id)
                      }
                      className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-secondary'
                      }`}
                    >
                      <span className="sans text-xs text-primary flex items-center gap-2">
                        {f.title}
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            f.status === 'target'
                              ? 'bg-warning-muted text-warning'
                              : 'bg-surface text-muted border border-border'
                          }`}
                        >
                          {f.status === 'target'
                            ? strings.architecture.statusTarget
                            : strings.architecture.statusCurrent}
                        </span>
                      </span>
                      <p className="sans text-[10px] text-muted mt-1 leading-snug">
                        {f.shortDescription}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.architecture.entityStorageTitle}
            </h3>
            <ul className="space-y-3">
              {ARCHITECTURE_ENTITY_STORAGE.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <p className="sans text-xs text-primary font-medium">{e.label}</p>
                  <p className="sans text-[10px] text-muted mt-1 leading-snug">
                    {e.summary}
                  </p>
                  <dl className="mt-2 space-y-1.5">
                    <div>
                      <dt className="sans text-[9px] uppercase tracking-wider text-muted">
                        {strings.architecture.entityStorageServer}
                      </dt>
                      <dd className="sans text-[10px] text-secondary leading-snug mt-0.5">
                        {e.server}
                      </dd>
                    </div>
                    <div>
                      <dt className="sans text-[9px] uppercase tracking-wider text-muted">
                        {strings.architecture.entityStorageClient}
                      </dt>
                      <dd className="sans text-[10px] text-secondary leading-snug mt-0.5">
                        {e.client}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.architecture.copyPreviewTitle}
            </h3>
            <pre className="sans text-[10px] text-secondary bg-black/20 rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre-wrap border border-border">
              {markdownPreview}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="sans text-xs flex items-center gap-1.5 bg-accent text-on-accent px-3 py-1.5 rounded-full"
          >
            {copyState === 'done' ? (
              <Check size={13} strokeWidth={2} />
            ) : (
              <Copy size={13} strokeWidth={1.5} />
            )}
            {copyState === 'done'
              ? strings.architecture.copied
              : copyState === 'failed'
                ? strings.architecture.copyFailed
                : strings.architecture.copy}
          </button>
        </footer>
      </div>
    </div>
  );
}
