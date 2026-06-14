import { useEffect, useState } from 'react';
import {
  parseAgentChatTranscript,
  loadThreadTranscript,
} from '../lib/agentChatArtifact.js';

/** @internal Exported for unit tests */
export function resolveAgentChatTranscriptSources({
  pinned = null,
  threadMeta = null,
  card = null,
} = {}) {
  const localTranscript = pinned?.content?.trim() || '';
  const effectiveArtifactRef =
    pinned?.artifactRef ?? threadMeta?.artifactRef ?? null;
  const filename =
    pinned?.filename
    ?? threadMeta?.filename
    ?? card?.versions?.[0]?.filename
    ?? null;
  const relativePath =
    pinned?.relativePath
    ?? threadMeta?.relativePath
    ?? card?.versions?.[0]?.relativePath
    ?? null;
  return { localTranscript, effectiveArtifactRef, filename, relativePath };
}

/**
 * Messages for an agent_chat canvas card (live when active, else parsed from transcript).
 * @param {{
 *   card: object | null,
 *   pinned?: object | null,
 *   threadMeta?: { artifactRef?: { id: string } | null, filename?: string | null, relativePath?: string | null } | null,
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   liveMessages: object[] | null,
 *   liveCardId: string | null,
 *   transcriptRevision?: number,
 * }} params
 */
export function useAgentChatCardMessages({
  card,
  pinned = null,
  threadMeta = null,
  folderHandle = null,
  liveMessages,
  liveCardId,
  transcriptRevision = 0,
}) {
  const { localTranscript, effectiveArtifactRef, filename, relativePath } =
    resolveAgentChatTranscriptSources({ pinned, threadMeta, card });

  const isLive = Boolean(
    card?.id && liveCardId && card.id === liveCardId && liveMessages?.length,
  );

  const [parsed, setParsed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isLive) {
      setParsed([]);
      setLoading(false);
      setError(false);
      return undefined;
    }

    if (localTranscript) {
      setParsed(parseAgentChatTranscript(localTranscript));
      setLoading(false);
      setError(false);
      return undefined;
    }

    const hasSource = Boolean(
      folderHandle && filename,
    ) || Boolean(effectiveArtifactRef?.id);

    if (!hasSource) {
      setParsed([]);
      setLoading(false);
      setError(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void loadThreadTranscript({
      folderHandle,
      artifactRef: effectiveArtifactRef,
      filename,
      relativePath,
    })
      .then((text) => {
        if (cancelled) return;
        if (text?.trim()) {
          setParsed(parseAgentChatTranscript(text));
          setError(false);
        } else {
          setParsed([]);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParsed([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLive,
    localTranscript,
    folderHandle,
    effectiveArtifactRef?.id,
    filename,
    relativePath,
    transcriptRevision,
  ]);

  const messages = isLive ? (liveMessages ?? []) : parsed;
  const showLoading = !isLive && loading;
  const showError = !isLive && error && !messages.length;

  return { messages, loading: showLoading, error: showError, isLive };
}
