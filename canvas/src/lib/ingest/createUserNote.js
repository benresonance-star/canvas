import { parseFilename, buildFilename } from '../filename.js';
import { previewCacheKey } from '../previewStore.js';
import { readFileEntry } from '../readFile.js';
import { writeUserNoteFile } from '../folderWrite.js';
import { enqueueArtifactSyncRetry } from '../artifactSyncOutbox.js';
import { ingestFoundFiles } from './syncIngest.js';
import {
  createLinksFromSource,
  ingestLinksFromVersions,
  buildCardKeyToArtifactRef,
} from './linkIngest.js';

export async function createUserNoteArtifact({
  projectId,
  projectName,
  folderHandle,
  prefix,
  name,
  body,
  linkTargetRefs = [],
  clusterId = null,
  cards = [],
}) {
  const filename = await writeUserNoteFile(folderHandle, { prefix, name, body, version: 1 });
  const parsed = parseFilename(filename);
  const cacheKey = previewCacheKey(projectId, parsed.fullBase, parsed.version);
  const entry = await folderHandle.getFileHandle(filename);
  const file = await readFileEntry(entry, { cacheKey });

  const flat = [{
    ...file,
    ...parsed,
    cardKey: parsed.fullBase,
    cardType: 'user_note',
    filename,
  }];

  let ingest;
  try {
    ingest = await ingestFoundFiles(projectId, projectName, flat, {});
  } catch (e) {
    ingest = {
      ok: false,
      reason: e?.message ?? 'ingest_failed',
      byFilename: {},
    };
  }

  const artifactRef = ingest.byFilename[filename]?.artifactRef ?? null;
  const effectiveClusterId = ingest.clusterId || clusterId;

  if (!artifactRef) {
    enqueueArtifactSyncRetry({
      kind: 'user_note',
      projectId,
      projectName,
      cardKey: parsed.fullBase,
      filename,
      prefix: parsed.prefix,
      name: parsed.name,
      cardType: 'user_note',
      version: parsed.version,
      content: file.content ?? body,
      contentHash: file.content_hash,
      retrievedAt: new Date(file.lastModified || Date.now()).toISOString(),
      lastError: ingest.reason ?? 'ingest_failed',
    });
  }

  if (artifactRef && effectiveClusterId && linkTargetRefs.length > 0) {
    await createLinksFromSource(effectiveClusterId, artifactRef, linkTargetRefs);
  }

  const flatWithRef = flat.map((v) => ({ ...v, artifactRef }));
  if (effectiveClusterId && flatWithRef[0].content) {
    const cardKeyToRef = buildCardKeyToArtifactRef(cards, {
      [parsed.fullBase]: { versions: flatWithRef },
    });
    if (artifactRef) cardKeyToRef.set(parsed.fullBase, artifactRef);
    await ingestLinksFromVersions({
      clusterId: effectiveClusterId,
      flatVersions: flatWithRef,
      cardKeyToRef,
    });
  }

  return {
    ingest,
    parsed,
    filename,
    file,
    artifactRef,
    card: {
      id: crypto.randomUUID(),
      key: parsed.fullBase,
      prefix: parsed.prefix,
      name: parsed.name,
      type: 'user_note',
      versions: [{
        ...file,
        ...parsed,
        artifactRef,
        artifactSyncState: artifactRef ? 'synced' : 'pending',
        content_hash: file.content_hash,
      }],
      pinnedVersion: parsed.version,
    },
  };
}
