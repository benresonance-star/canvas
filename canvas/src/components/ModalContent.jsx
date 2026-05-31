import React from 'react';
import { Download } from 'lucide-react';
import { strings } from '../content/strings.js';
import { normalizeCardType } from '../lib/filename.js';
import { useArtifactPayloadText } from '../hooks/useArtifactPayloadText.js';
import { PdfPreviewFrame } from './PdfPreviewFrame.jsx';
import { SpreadsheetPreviewFrame } from './SpreadsheetPreviewFrame.jsx';
import { AudioPlayer } from './AudioPlayer.jsx';
import { audioSkinUsesDarkText, resolveAudioSkinColor } from '../lib/audioSkin.js';

export function ModalContent({ card, version }) {
  const cardType = normalizeCardType(card?.type);
  const localTranscript = version?.content?.trim() || '';
  const artifactRefId =
    cardType === 'agent_chat' && !localTranscript && version?.artifactRef?.id
      ? version.artifactRef.id
      : null;
  const artifactPayload = useArtifactPayloadText(artifactRefId, Boolean(artifactRefId));

  if (!version) return null;

  const mediaSrc = version.objectUrl || version.dataUrl || null;

  if (cardType === 'spreadsheet') {
    return (
      <SpreadsheetPreviewFrame
        card={card}
        pinned={version}
        isActive
        compact={false}
      />
    );
  }

  if ((card.type === 'image' || card.type === 'pdf') && !mediaSrc) {
    if (version.previewStripped) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg mb-2">{strings.preview.modalNotStored}</div>
          <div className="sans text-xs text-muted max-w-md">{strings.preview.modalResyncHint}</div>
        </div>
      );
    }
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div>
          <div className="serif text-secondary text-lg mb-2">{strings.preview.modalTooLarge}</div>
          <div className="sans text-xs text-muted">
            {version.filename} · {(version.size / 1024 / 1024).toFixed(1)}MB
          </div>
        </div>
      </div>
    );
  }

  if (card.type === 'image' && mediaSrc) {
    return (
      <div className="h-full overflow-auto flex items-center justify-center p-4 bg-surface-muted">
        <img src={mediaSrc} alt={card.name} className="max-w-full max-h-full" />
      </div>
    );
  }

  if (card.type === 'pdf' && mediaSrc) {
    return (
      <PdfPreviewFrame
        mediaSrc={mediaSrc}
        iframeKey={`${card.id}-v${version.version}-modal-pdf`}
        title={card.name}
        pointerEventsNone={false}
      />
    );
  }

  if (card.type === 'video' && mediaSrc) {
    return (
      <div className="h-full flex items-center justify-center bg-primary">
        <video src={mediaSrc} controls className="max-w-full max-h-full" />
      </div>
    );
  }

  if (cardType === 'audio') {
    if (!mediaSrc) {
      if (version.previewStripped) {
        return (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="serif text-secondary text-lg mb-2">{strings.preview.modalNotStored}</div>
            <div className="sans text-xs text-muted max-w-md">{strings.preview.modalResyncHint}</div>
          </div>
        );
      }
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg mb-2">{strings.audio.noPreview}</div>
        </div>
      );
    }
    const meta = version.audioMeta || {};
    const skinColor = resolveAudioSkinColor(card);
    return (
      <div
        className="h-full flex items-center justify-center p-8"
        style={{ backgroundColor: skinColor || undefined }}
      >
        <div className="w-full max-w-md">
          <AudioPlayer
            src={mediaSrc}
            title={meta.title || card.name}
            artist={meta.artist}
            onLightBackground={skinColor ? audioSkinUsesDarkText(skinColor) : false}
          />
        </div>
      </div>
    );
  }

  if (!version.inline) {
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div>
          <div className="serif text-secondary text-lg mb-2">{strings.preview.modalTooLarge}</div>
          <div className="sans text-xs text-muted">
            {version.filename} · {(version.size / 1024 / 1024).toFixed(1)}MB
          </div>
        </div>
      </div>
    );
  }

  if (cardType === 'markdown' || cardType === 'user_note' || cardType === 'agent_chat') {
    const body =
      cardType === 'agent_chat'
        ? localTranscript || artifactPayload.text || ''
        : version.content || '';
    if (cardType === 'agent_chat' && !body && artifactPayload.loading) {
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg">{strings.preview.loadingTranscript}</div>
        </div>
      );
    }
    if (cardType === 'agent_chat' && !body && artifactPayload.error) {
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div className="serif italic text-muted text-lg max-w-md">
            {strings.preview.transcriptUnavailable}
          </div>
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto px-12 py-10">
        <div className="serif text-lg text-primary leading-relaxed max-w-2xl mx-auto whitespace-pre-wrap">
          {body}
        </div>
      </div>
    );
  }

  if (card.type === 'html' && version.content) {
    return (
      <iframe
        srcDoc={version.content}
        sandbox="allow-same-origin allow-scripts"
        className="w-full h-full border-0 bg-surface"
        title={card.name}
      />
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-center p-8">
      <div>
        <div className="serif text-secondary text-lg mb-3">{version.ext.toUpperCase()} file</div>
        {mediaSrc && (
          <a
            href={mediaSrc}
            download={version.filename}
            className="sans inline-flex items-center gap-2 text-xs bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded transition"
          >
            <Download size={13} strokeWidth={1.5} /> {strings.modal.download} {version.filename}
          </a>
        )}
      </div>
    </div>
  );
}
