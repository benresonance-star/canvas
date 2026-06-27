import {
  ensureWritePermission,
  getFileHandleAtPath,
  overwriteTextFileAtPath,
  renameUserNoteFile,
  fileExistsInFolder,
} from '../folderWrite.js';
import {
  buildFilename,
  folderRelativePathFromVersion,
  parseFilename,
} from '../filename.js';
import { readFileEntry } from '../readFile.js';
import { updateArtifactContent, isApiAvailable } from '../primitivesApi.js';
import { serializeUserTask } from '../../features/tasks/domain/userTaskContent.js';
import { DEFAULT_USER_TASK_STATUS } from '../../features/tasks/domain/userTaskContent.js';
import { ingestFoundFiles } from './syncIngest.js';
import {
  buildCardKeyToArtifactRef,
  ingestLinksFromVersions,
} from './linkIngest.js';

import { validateUserNoteName as validateUserTaskName } from './saveUserNote.js';

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

async function checkRenameCollisions(folderHandle, card, newName) {
  const prefix = card.prefix;
  for (const v of card.versions) {
    const newFilename = buildFilename({ prefix, name: newName, version: v.version, ext: 'md' });
    if (newFilename !== v.filename && (await fileExistsInFolder(folderHandle, newFilename))) {
      return true;
    }
  }
  return false;
}

async function renameAllVersions({
  folderHandle,
  card,
  versionNum,
  body,
  newName,
}) {
  if (await checkRenameCollisions(folderHandle, card, newName)) {
    return { ok: false, reason: 'name_collision' };
  }

  const prefix = card.prefix;
  const updatedVersions = [];

  for (const v of card.versions) {
    const versionBody = v.version === versionNum ? body : undefined;
    const result = await renameUserNoteFile(folderHandle, v.filename, {
      prefix,
      name: newName,
      version: v.version,
      body: versionBody,
    });
    if (result?.collision) {
      return { ok: false, reason: 'name_collision' };
    }
    const filename = typeof result === 'string' ? result : v.filename;
    updatedVersions.push(await refreshVersionFromFile(folderHandle, v, filename));
  }

  const parsed = parseFilename(updatedVersions.find((v) => v.version === versionNum)?.filename
    ?? buildFilename({ prefix, name: newName, version: versionNum, ext: 'md' }));

  return {
    ok: true,
    versions: updatedVersions,
    cardUpdates: {
      key: parsed.fullBase,
      name: parsed.name,
      prefix: parsed.prefix,
      versions: updatedVersions,
    },
  };
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
        cardType: 'user_task',
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
      flatVersions: [{ ...versionWithRef, cardKey, cardType: 'user_task' }],
      cardKeyToRef,
    });
  }

  return { versionWithRef, apiUnavailable };
}

export async function saveUserTask({
  projectId,
  projectName,
  folderHandle,
  clusterId,
  card,
  versionNum,
  body,
  name,
  taskStatus = card.taskStatus ?? DEFAULT_USER_TASK_STATUS,
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

  const nameValidation = validateUserTaskName(name ?? card.name);
  if (!nameValidation.ok) {
    return { ok: false, reason: nameValidation.reason };
  }
  const trimmedName = nameValidation.name;
  const nameChanged = trimmedName !== card.name;
  const serialized = serializeUserTask({ taskStatus, body });

  let cardKey = card.key;
  let cardUpdates = null;
  let workingVersions = card.versions;

  if (nameChanged) {
    const renameResult = await renameAllVersions({
      folderHandle,
      card,
      versionNum,
      body: serialized,
      newName: trimmedName,
    });
    if (!renameResult.ok) return renameResult;
    cardUpdates = renameResult.cardUpdates;
    workingVersions = renameResult.versions;
    cardKey = cardUpdates.key;
  } else {
    const relativePath = folderRelativePathFromVersion(ver);
    await overwriteTextFileAtPath(folderHandle, relativePath, serialized);
    const updated = await refreshVersionFromFile(folderHandle, ver, ver.filename);
    workingVersions = card.versions.map((v) =>
      v.version === versionNum ? updated : v,
    );
  }

  const pinnedVer = workingVersions.find((v) => v.version === versionNum) ?? ver;
  const { versionWithRef, apiUnavailable } = await patchArtifactAndLinks({
    projectId,
    projectName,
    folderHandle,
    clusterId,
    card,
    cardKey,
    versionNum,
    ver: pinnedVer,
    body: serialized,
    cards,
  });

  const finalVersions = workingVersions.map((v) =>
    v.version === versionNum ? versionWithRef : v,
  );

  if (cardUpdates) {
    cardUpdates.versions = finalVersions;
    cardUpdates.taskStatus = taskStatus;
  }

  return {
    ok: true,
    apiUnavailable,
    version: versionWithRef,
    versionNum,
    taskStatus,
    cardUpdates: {
      ...(cardUpdates ?? {}),
      versions: finalVersions,
      taskStatus,
    },
  };
}
