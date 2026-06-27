import { getArtifact } from './agentApi.js';
import {
  cardKeyFromFilename,
  isCardMissingFromFolder,
  normalizeCardType,
  toCanonicalSyncKey,
} from './filename.js';
import {
  dataUrlToBytes,
} from '../features/agents/domain/saveGeneratedImageToFolder.js';
import { relativePathFromOutput } from '../features/agents/domain/agentArtifact.js';
import { ensureWritePermission, writeBinaryFileAtPath } from './folderWrite.js';

function isGeneratedImageCard(card) {
  if (normalizeCardType(card?.type) !== 'image') return false;
  const relativePath = card?.versions?.[0]?.relativePath;
  return typeof relativePath === 'string' && relativePath.startsWith('generated/');
}

async function resolveGeneratedImageDataUrl(card) {
  const version = card?.versions?.[0];
  if (version?.dataUrl?.startsWith('data:image/')) {
    return version.dataUrl;
  }
  const artifactId = version?.artifactRef?.id;
  if (!artifactId) return null;
  try {
    const artifact = await getArtifact(artifactId);
    const payload = artifact?.payload_text ?? artifact?.artifact?.payload_text;
    return typeof payload === 'string' && payload.startsWith('data:image/')
      ? payload
      : null;
  } catch {
    return null;
  }
}

/**
 * Re-export generated image cards to the linked folder after scan.
 * @param {{
 *   folderHandle: FileSystemDirectoryHandle,
 *   folderPresentKeys: Iterable<string> | null,
 *   cards?: object[],
 * }} params
 */
export async function backfillMissingGeneratedImages({
  folderHandle,
  folderPresentKeys,
  cards = [],
}) {
  if (!folderHandle || !folderPresentKeys) {
    return { attempted: 0, written: 0, writtenKeys: [] };
  }

  const canWrite = await ensureWritePermission(folderHandle);
  if (!canWrite) {
    return { attempted: 0, written: 0, writtenKeys: [] };
  }

  const folderKeySet = new Set(
    [...folderPresentKeys]
      .map((key) => toCanonicalSyncKey(key))
      .filter(Boolean),
  );

  const missing = (cards ?? []).filter((card) => {
    if (!isGeneratedImageCard(card)) return false;
    return isCardMissingFromFolder({
      folderConnected: true,
      folderKeySet,
      card,
    });
  });

  const writtenKeys = [];
  for (const card of missing) {
    const version = card.versions?.[0];
    const relativePath = version?.relativePath ?? relativePathFromOutput({ filePath: version?.filename });
    if (!relativePath?.startsWith('generated/')) continue;

    const dataUrl = await resolveGeneratedImageDataUrl(card);
    if (!dataUrl) continue;

    try {
      await writeBinaryFileAtPath(folderHandle, relativePath, dataUrlToBytes(dataUrl));
      const cardKey = cardKeyFromFilename(relativePath);
      if (cardKey) writtenKeys.push(toCanonicalSyncKey(cardKey));
    } catch {
      // skip failed backfill rows
    }
  }

  return {
    attempted: missing.length,
    written: writtenKeys.length,
    writtenKeys,
  };
}
