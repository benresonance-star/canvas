import { loadAgentChatSession } from './agentChatPersistence.js';
import { getConnectorById } from './agentConnectors.js';
import {
  connectorIdFromAgentChatFilename,
  findThreadIdByFilenameSlug,
  loadThreadIndex,
} from './agentChatThreads.js';
import {
  loadThreadTranscript,
  parseAgentChatTranscript,
  syncAgentChatArtifact,
} from './agentChatArtifact.js';
import {
  cardKeyFromFilename,
  isCardMissingFromFolder,
  normalizeCardType,
  toCanonicalSyncKey,
} from './filename.js';

/**
 * Re-export missing agent-chat canvas cards to the linked folder after scan.
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   folderHandle: FileSystemDirectoryHandle,
 *   folderPresentKeys: Iterable<string> | null,
 *   cards?: object[],
 * }} params
 * @returns {Promise<{ attempted: number, written: number, writtenKeys: string[] }>}
 */
export async function backfillMissingAgentChatTranscripts({
  projectId,
  projectName,
  folderHandle,
  folderPresentKeys,
  cards = [],
}) {
  if (!projectId || !folderHandle || !folderPresentKeys) {
    return { attempted: 0, written: 0, writtenKeys: [] };
  }

  const folderKeySet = new Set(
    [...folderPresentKeys]
      .map((key) => toCanonicalSyncKey(key))
      .filter(Boolean),
  );

  const missing = (cards ?? []).filter((card) => {
    if (normalizeCardType(card?.type) !== 'agent_chat') return false;
    return isCardMissingFromFolder({
      folderConnected: true,
      folderKeySet,
      card,
    });
  });

  const writtenKeys = [];
  for (const card of missing) {
    const filename = card.versions?.[0]?.filename || `${card.key}.md`;
    const connectorId = connectorIdFromAgentChatFilename(filename);
    if (!connectorId) continue;

    const index = await loadThreadIndex(projectId, connectorId);
    const threadId =
      card.agentThreadId
      || findThreadIdByFilenameSlug(index.threads, filename);
    if (!threadId) continue;

    const threadMeta = index.threads.find((t) => t.threadId === threadId);
    if (!threadMeta) continue;

    const session = await loadAgentChatSession(projectId, connectorId, threadId);
    let messages = session?.messages ?? [];
    if (!messages.length) {
      const markdown = await loadThreadTranscript({
        folderHandle: null,
        artifactRef: threadMeta.artifactRef ?? card.versions?.[0]?.artifactRef ?? null,
        filename,
        relativePath: threadMeta.relativePath ?? card.versions?.[0]?.relativePath ?? null,
      });
      if (markdown) {
        messages = parseAgentChatTranscript(markdown);
      }
    }

    const connector = getConnectorById(connectorId);
    const syncResult = await syncAgentChatArtifact({
      projectId,
      projectName,
      folderHandle,
      connectorId,
      connectorLabel: connector?.label ?? connectorId,
      threadId,
      title: threadMeta.title ?? card.name,
      agentTemplateId: threadMeta.agentTemplateId ?? null,
      agentTypeLabel: threadMeta.agentTypeLabel ?? null,
      model: threadMeta.model ?? null,
      messages,
      artifactRef: threadMeta.artifactRef ?? card.versions?.[0]?.artifactRef ?? null,
      filename,
    });

    if (syncResult.ok) {
      const cardKey = cardKeyFromFilename(filename);
      if (cardKey) writtenKeys.push(cardKey);
    }
  }

  return {
    attempted: missing.length,
    written: writtenKeys.length,
    writtenKeys,
  };
}
