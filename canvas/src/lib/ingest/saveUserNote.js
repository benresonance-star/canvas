import {
  ensureWritePermission,
  getFileHandleAtPath,
  overwriteTextFileAtPath,
} from '../folderWrite.js';
import {
  folderRelativePathFromVersion,
  parseFilename,
} from '../filename.js';
import { readFileEntry } from '../readFile.js';
import { updateArtifactContent, isApiAvailable } from '../primitivesApi.js';
import { ingestFoundFiles } from './syncIngest.js';
import {
  buildCardKeyToArtifactRef,
  ingestLinksFromVersions,
} from './linkIngest.js';
import { renameAllArtifactVersions } from './renameUserArtifact.js';

export function validateUserNoteName(name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'name_required' };
  if (/[\\/:*?"<>|]/.test(trimmed)) return { ok: false, reason: 'name_invalid' };
  if (trimmed.includes('__')) return { ok: false, reason: 'name_invalid' };
  return { ok: true, name: trimmed };
}

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
    relativePath,
    cardKey: parsed.fullBase,
    content: file.content ?? ver.content,
  };
}

async function renameAllVersions({ folderHandle, card, versionNum, body, newName }) {
  return renameAllArtifactVersions({
    folderHandle,
    card,
    versionNum,
    body,
    newName,
  });
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
        cardType: 'user_note',
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
      flatVersions: [{ ...versionWithRef, cardKey, cardType: 'user_note' }],
      cardKeyToRef,
    });
  }

  return { versionWithRef, apiUnavailable };
}

export async function saveUserNote({
  projectId,
  projectName,
  folderHandle,
  clusterId,
  card,
  versionNum,
  body,
  name,
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

  const nameValidation = validateUserNoteName(name ?? card.name);
  if (!nameValidation.ok) {
    return { ok: false, reason: nameValidation.reason };
  }
  const trimmedName = nameValidation.name;
  const nameChanged = trimmedName !== card.name;

  let cardKey = card.key;
  let cardUpdates = null;
  let workingVersions = card.versions;

  if (nameChanged) {
    const renameResult = await renameAllVersions({
      folderHandle,
      card,
      versionNum,
      body,
      newName: trimmedName,
    });
    if (!renameResult.ok) return renameResult;
    cardUpdates = renameResult.cardUpdates;
    workingVersions = renameResult.versions;
    cardKey = cardUpdates.key;
  } else {
    const relativePath = folderRelativePathFromVersion(ver);
    await overwriteTextFileAtPath(folderHandle, relativePath, body);
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
    body,
    cards,
  });

  const finalVersions = workingVersions.map((v) =>
    v.version === versionNum ? versionWithRef : v,
  );

  if (cardUpdates) {
    cardUpdates.versions = finalVersions;
  }

  return {
    ok: true,
    apiUnavailable,
    version: versionWithRef,
    versionNum,
    cardUpdates: cardUpdates
      ? { ...cardUpdates, versions: finalVersions }
      : null,
  };
}
