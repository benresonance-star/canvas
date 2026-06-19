import {
  ensureWritePermission,
  getFileHandleAtPath,
} from '../folderWrite.js';
import { folderRelativePathFromVersion, parseFilename } from '../filename.js';
import { readFileEntry } from '../readFile.js';
import { updateArtifactContent, isApiAvailable } from '../primitivesApi.js';
import { ingestFoundFiles } from './syncIngest.js';
import {
  buildCardKeyToArtifactRef,
  ingestLinksFromVersions,
} from './linkIngest.js';

async function refreshVersionFromFile(folderHandle, ver, filename) {
  const relativePath = folderRelativePathFromVersion({ ...ver, filename });
  const entry = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await readFileEntry(entry, {
    cacheKey: ver.previewCacheKey ?? undefined,
    relativePath,
  });
  const parsed = parseFilename(filename);
  return {
    ...ver,
    ...file,
    ...parsed,
    filename,
    ...(relativePath && relativePath !== filename ? { relativePath } : {}),
    content: file.content ?? ver.content,
  };
}

async function overwriteArtifactFile(folderHandle, ver, body) {
  const relativePath = folderRelativePathFromVersion(ver);
  const entry = await getFileHandleAtPath(folderHandle, relativePath);
  const writable = await entry.createWritable();
  await writable.write(body);
  await writable.close();
}

async function patchArtifactAndLinks({
  projectId,
  projectName,
  folderHandle,
  clusterId,
  card,
  cardKey,
  versionNum,
  ver,
  body,
  cards,
}) {
  const relativePath = folderRelativePathFromVersion(ver);
  const entry = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await readFileEntry(entry, {
    cacheKey: ver.previewCacheKey ?? undefined,
    relativePath,
  });

  const updatedVersion = {
    ...ver,
    ...file,
    content: file.content ?? body,
  };

  let artifactRef = ver.artifactRef ?? null;
  let apiUnavailable = false;
  const cardType = card.type ?? 'markdown';

  const apiOk = await isApiAvailable();
  if (apiOk && artifactRef?.id) {
    try {
      await updateArtifactContent(artifactRef.id, {
        content_hash: file.content_hash,
        payload_text: file.content ?? body,
      });
    } catch {
      apiUnavailable = true;
    }
  } else if (apiOk && !artifactRef?.id && projectId) {
    try {
      const flat = [{
        ...updatedVersion,
        cardKey,
        cardType,
      }];
      const ingest = await ingestFoundFiles(projectId, projectName, flat, {});
      const ing = ingest.byFilename?.[relativePath];
      if (ing?.artifactRef) artifactRef = ing.artifactRef;
      else apiUnavailable = !ingest.ok;
    } catch {
      apiUnavailable = true;
    }
  } else if (!apiOk) {
    apiUnavailable = true;
  }

  const versionWithRef = {
    ...updatedVersion,
    artifactRef,
    content_hash: file.content_hash,
  };

  if (apiOk && clusterId && artifactRef?.id) {
    const cardKeyToRef = buildCardKeyToArtifactRef(cards, {
      [cardKey]: { versions: [versionWithRef] },
    });
    cardKeyToRef.set(cardKey, artifactRef);
    await ingestLinksFromVersions({
      clusterId,
      flatVersions: [{ ...versionWithRef, cardKey, cardType }],
      cardKeyToRef,
    });
  }

  return { versionWithRef, apiUnavailable };
}

export async function saveMarkdownArtifact({
  projectId,
  projectName,
  folderHandle,
  clusterId,
  card,
  versionNum,
  body,
  cards = [],
}) {
  if (!folderHandle) {
    return { ok: false, reason: 'no_folder' };
  }
  const canWrite = await ensureWritePermission(folderHandle);
  if (!canWrite) {
    return { ok: false, reason: 'write_denied' };
  }

  const ver = card.versions.find((v) => v.version === versionNum);
  if (!ver?.filename) {
    return { ok: false, reason: 'no_version' };
  }

  await overwriteArtifactFile(folderHandle, ver, body);
  const updated = await refreshVersionFromFile(folderHandle, ver, ver.filename);
  const workingVersions = card.versions.map((v) =>
    v.version === versionNum ? updated : v,
  );

  const { versionWithRef, apiUnavailable } = await patchArtifactAndLinks({
    projectId,
    projectName,
    folderHandle,
    clusterId,
    card,
    cardKey: card.key,
    versionNum,
    ver: updated,
    body,
    cards,
  });

  const finalVersions = workingVersions.map((v) =>
    v.version === versionNum ? versionWithRef : v,
  );

  return {
    ok: true,
    apiUnavailable,
    version: versionWithRef,
    versionNum,
    cardUpdates: { versions: finalVersions },
  };
}
