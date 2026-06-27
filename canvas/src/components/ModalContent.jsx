import React from 'react';
import { Download } from 'lucide-react';
import { strings } from '../content/strings.js';
import { normalizeCardType, isCodePreviewType } from '../lib/filename.js';
import { useArtifactPayloadText } from '../hooks/useArtifactPayloadText.js';
import { buildHtmlPreviewSrcDoc } from '../lib/htmlPreviewDocument.js';
import { PdfPreviewFrame } from './PdfPreviewFrame.jsx';
import { SpreadsheetArtifactView } from './SpreadsheetArtifactView.jsx';
import { AudioPlayer } from './AudioPlayer.jsx';
import { audioSkinUsesDarkText, resolveAudioSkinColor } from '../lib/audioSkin.js';
import { NotePreviewFrame } from './NotePreviewFrame.jsx';
import { CodePreviewFrame } from './CodePreviewFrame.jsx';
import { AgentChatThreadView } from './AgentChatThreadView.jsx';
import { parseAgentChatTranscript } from '../lib/agentChatArtifact.js';
import { LiveArtifactView } from '../features/live/components/LiveArtifactView.jsx';
import { BeatAgentFullscreen } from '../features/music/agents/beat/components/BeatAgentFullscreen.jsx';
import { SonicStudioEditor } from '../features/sonicStudio/components/SonicStudioEditor.jsx';

export function ModalContent({
  card,
  version,
  folderHandle = null,
  projectId = null,
  onUpdateCard = null,
}) {
  const cardType = normalizeCardType(card?.type);
  const localTranscript = version?.content?.trim() || '';
  const artifactRefId =
    (cardType === 'agent_chat' || isCodePreviewType(cardType))
    && !localTranscript
    && version?.artifactRef?.id
      ? version.artifactRef.id
      : (
        cardType === 'image'
        && !version?.objectUrl
        && !version?.dataUrl
        && version?.artifactRef?.id
          ? version.artifactRef.id
          : null
      );
  const artifactPayload = useArtifactPayloadText(artifactRefId, Boolean(artifactRefId));

  if (!version) return null;

  if (cardType === 'live') {
    return (
      <div className="h-full p-6 bg-surface">
        <LiveArtifactView
          liveArtifactId={card.liveArtifactId || version.liveArtifactId || version.artifactRef?.id}
          projectId={projectId || card.projectId}
          folderHandle={folderHandle}
        />
      </div>
    );
  }

  if (cardType === 'music-agent') {
    return (
      <BeatAgentFullscreen
        card={card}
        projectId={projectId || card.projectId}
        folderHandle={folderHandle}
        onUpdateCard={onUpdateCard}
      />
    );
  }

  if (cardType === 'sonic_studio') {
    return (
      <SonicStudioEditor
        card={card}
        onUpdateCard={onUpdateCard}
      />
    );
  }

  const mediaSrc =
    version.objectUrl
    || version.dataUrl
    || (card.type === 'image' && artifactPayload.text?.startsWith('data:image/')
      ? artifactPayload.text
      : null)
    || null;

  function formatVersionSizeLabel(size) {
    if (!Number.isFinite(size) || size <= 0) return null;
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  if (cardType === 'spreadsheet') {
    return (
      <SpreadsheetArtifactView
        card={card}
        pinned={version}
        isActive
        compact={false}
        showViewerSelect={false}
        inCard={false}
      />
    );
  }

  if ((card.type === 'image' || card.type === 'pdf') && !mediaSrc) {
    if (card.type === 'image' && artifactPayload.loading) {
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg">{strings.preview.loadingPdf}</div>
        </div>
      );
    }
    if (version.previewCacheKey) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg">{strings.preview.loadingPdf}</div>
        </div>
      );
    }
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
            {version.filename}
            {formatVersionSizeLabel(version.size) ? ` · ${formatVersionSizeLabel(version.size)}` : ''}
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
      <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
        <PdfPreviewFrame
          mediaSrc={mediaSrc}
          iframeKey={`${card.id}-v${version.version}-modal-pdf`}
          title={card.name}
          pointerEventsNone={false}
        />
      </div>
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

  if (isCodePreviewType(cardType)) {
    const content = localTranscript || artifactPayload.text || '';
    if (!content && artifactPayload.loading) {
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div className="serif text-secondary text-lg">{strings.preview.loadingPdf}</div>
        </div>
      );
    }
    if (!content && !version.inline) {
      return (
        <div className="h-full flex items-center justify-center text-center p-8">
          <div>
            <div className="serif text-secondary text-lg mb-2">{strings.preview.modalTooLarge}</div>
            <div className="sans text-xs text-muted">
              {version.filename}
              {formatVersionSizeLabel(version.size) ? ` · ${formatVersionSizeLabel(version.size)}` : ''}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full w-full min-h-0 p-4">
        <CodePreviewFrame
          content={content}
          filename={version.filename}
          ext={version.ext}
          compact={false}
        />
      </div>
    );
  }

  if (!version.inline) {
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div>
          <div className="serif text-secondary text-lg mb-2">{strings.preview.modalTooLarge}</div>
          <div className="sans text-xs text-muted">
            {version.filename}
            {formatVersionSizeLabel(version.size) ? ` · ${formatVersionSizeLabel(version.size)}` : ''}
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
    if (cardType === 'markdown' || cardType === 'user_note') {
      return (
        <NotePreviewFrame
          content={body}
          contentKey={`${card.id}-v${version.version}-${cardType}-modal`}
          isActive
          compact={false}
        />
      );
    }
    return (
      <div className="h-full overflow-y-auto px-8 py-8">
        <AgentChatThreadView
          messages={parseAgentChatTranscript(body)}
          scrollOnUpdate={false}
          className="max-w-2xl mx-auto"
        />
      </div>
    );
  }

  if (card.type === 'html' && version.content) {
    return (
      <iframe
        srcDoc={buildHtmlPreviewSrcDoc(version.content, { interceptInternalLinks: true })}
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
