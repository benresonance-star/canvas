import { parseFilename } from '../filename.js';
import { previewCacheKey } from '../previewStore.js';
import { readFileEntry } from '../readFile.js';
import { writeUserTaskFile } from '../folderWrite.js';
import { enqueueArtifactSyncRetry } from '../artifactSyncOutbox.js';
import { serializeUserTask, DEFAULT_USER_TASK_STATUS } from '../../features/tasks/domain/userTaskContent.js';
import { ingestFoundFiles } from './syncIngest.js';
import {
  createLinksFromSource,
  ingestLinksFromVersions,
  buildCardKeyToArtifactRef,
} from './linkIngest.js';

export async function createUserTaskArtifact({
  projectId,
  projectName,
  folderHandle,
  prefix,
  name,
  body,
  taskStatus = DEFAULT_USER_TASK_STATUS,
  linkTargetRefs = [],
  clusterId = null,
  cards = [],
}) {
  const serialized = serializeUserTask({ taskStatus, body });
  const filename = await writeUserTaskFile(folderHandle, {
    prefix,
    name,
    body: serialized,
    version: 1,
  });
  const parsed = parseFilename(filename);
  const cacheKey = previewCacheKey(projectId, parsed.fullBase, parsed.version);
  const entry = await folderHandle.getFileHandle(filename);
  const file = await readFileEntry(entry, { cacheKey });

  const flat = [{
    ...file,
    ...parsed,
    cardKey: parsed.fullBase,
    cardType: 'user_task',
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
      kind: 'user_task',
      projectId,
      projectName,
      cardKey: parsed.fullBase,
      filename,
      prefix: parsed.prefix,
      name: parsed.name,
      cardType: 'user_task',
      version: parsed.version,
      content: file.content ?? serialized,
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
      type: 'user_task',
      taskStatus,
      versions: [{
        ...file,
        ...parsed,
        artifactRef,
        artifactSyncState: artifactRef ? 'synced' : 'pending',
        content_hash: file.content_hash,
        content: file.content ?? serialized,
      }],
      pinnedVersion: parsed.version,
    },
  };
}
