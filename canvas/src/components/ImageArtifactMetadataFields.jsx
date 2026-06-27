import React, { useState } from 'react';
import { strings } from '../content/strings.js';
import { FieldRow } from './FieldRow.jsx';
import {
  formatImageBitDepth,
  formatImageDimensions,
  formatImageFileSize,
  isGeneratedImageMetadata,
  resolveGeneratedImageProvenance,
  resolveImageMetadata,
} from '../lib/image/imageArtifactMetadata.js';
import { formatGeneratedImageModelLabel } from '../features/agents/domain/imageModelOptions.js';

export function ImageArtifactMetadataFields({ meta, version = null }) {
  const imageMeta = resolveImageMetadata(meta, version);
  const showGeneratedPrompts = isGeneratedImageMetadata(meta)
    || isGeneratedImageMetadata(version?.generatedMetadata);
  const generatedProvenance = resolveGeneratedImageProvenance(meta, version);
  const generationModelLabel = formatGeneratedImageModelLabel(generatedProvenance);
  const generatedMeta = {
    ...(version?.generatedMetadata ?? {}),
    ...(meta ?? {}),
  };
  const [agentPromptOpen, setAgentPromptOpen] = useState(false);

  if (!imageMeta && !showGeneratedPrompts) return null;

  return (
    <>
      {imageMeta && (
        <>
          <FieldRow
            label={strings.image.fileType}
            value={imageMeta.mimeType ? `${imageMeta.mimeType}${imageMeta.ext ? ` (.${imageMeta.ext})` : ''}` : null}
          />
          <FieldRow
            label={strings.image.fileSize}
            value={formatImageFileSize(imageMeta.fileSizeBytes)}
          />
          <FieldRow
            label={strings.image.dimensions}
            value={formatImageDimensions(imageMeta)}
          />
          <FieldRow
            label={strings.image.bitDepth}
            value={formatImageBitDepth(imageMeta)}
          />
        </>
      )}
      {showGeneratedPrompts && generatedMeta?.originalPromptSnapshot && (
        <section className="py-2">
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">
            {strings.image.originalPrompt}
          </div>
          <pre className="sans text-xs text-secondary whitespace-pre-wrap font-serif max-h-40 overflow-y-auto">
            {generatedMeta.originalPromptSnapshot}
          </pre>
        </section>
      )}
      {showGeneratedPrompts && generationModelLabel && (
        <FieldRow label={strings.image.generationModel} value={generationModelLabel} />
      )}
      {showGeneratedPrompts && generatedMeta?.agentPromptSnapshot && (
        <section className="py-2">
          <button
            type="button"
            className="sans text-[10px] uppercase tracking-wider text-muted mb-1 hover:text-secondary"
            onClick={() => setAgentPromptOpen((open) => !open)}
          >
            {strings.image.agentPrompt}
            {agentPromptOpen ? ' ▾' : ' ▸'}
          </button>
          {agentPromptOpen && (
            <pre className="sans text-xs text-secondary whitespace-pre-wrap font-serif max-h-48 overflow-y-auto">
              {generatedMeta.agentPromptSnapshot}
            </pre>
          )}
        </section>
      )}
    </>
  );
}
