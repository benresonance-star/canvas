import {
  buildFilename,
  cardKeyFromFilename,
  folderPathDirname,
  folderRelativePathFromVersion,
  parseFilename,
  relativePathAfterFilenameRename,
} from '../filename.js';
import {
  fileExistsAtFolderPath,
  getFileHandleAtPath,
  renameUserNoteFileAtPath,
} from '../folderWrite.js';
import { readFileEntry } from '../readFile.js';

async function refreshVersionFromFile(folderHandle, ver, filename, relativePath) {
  const entry = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await readFileEntry(entry, {
    cacheKey: ver.previewCacheKey ?? undefined,
    relativePath,
  });
  const parsed = parseFilename(filename);
  const cardKey = cardKeyFromFilename(relativePath);
  return {
    ...ver,
    ...file,
    ...parsed,
    filename,
    relativePath,
    cardKey,
    content: file.content ?? ver.content,
  };
}

async function checkRenameCollisions(folderHandle, card, newName) {
  const prefix = card.prefix;
  for (const v of card.versions) {
    const oldRelativePath = folderRelativePathFromVersion(v);
    const newFilename = buildFilename({ prefix, name: newName, version: v.version, ext: 'md' });
    const newRelativePath = relativePathAfterFilenameRename(oldRelativePath, newFilename);
    if (
      newRelativePath !== oldRelativePath
      && (await fileExistsAtFolderPath(folderHandle, newRelativePath))
    ) {
      return true;
    }
  }
  return false;
}

function cardPathFieldsFromVersion(version) {
  const relativePath = folderRelativePathFromVersion(version);
  if (!relativePath || !folderPathDirname(relativePath)) {
    return { relativePath: null, folderPath: null };
  }
  return { relativePath, folderPath: relativePath };
}

/**
 * Rename all markdown versions for a folder-backed note/task and relink card metadata.
 * @param {{ folderHandle: object, card: object, versionNum: number, body?: string, newName: string }} input
 */
export async function renameAllArtifactVersions({
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
    const oldRelativePath = folderRelativePathFromVersion(v);
    const versionBody = v.version === versionNum ? body : undefined;
    const result = await renameUserNoteFileAtPath(folderHandle, oldRelativePath, {
      prefix,
      name: newName,
      version: v.version,
      body: versionBody,
    });
    if (result?.collision) {
      return { ok: false, reason: 'name_collision' };
    }
    const newRelativePath = typeof result === 'string' ? result : oldRelativePath;
    const filename = buildFilename({ prefix, name: newName, version: v.version, ext: 'md' });
    updatedVersions.push(
      await refreshVersionFromFile(folderHandle, v, filename, newRelativePath),
    );
  }

  const pinnedVersion = updatedVersions.find((v) => v.version === versionNum)
    ?? updatedVersions[0];
  const pinnedRelativePath = folderRelativePathFromVersion(pinnedVersion);
  const parsed = parseFilename(
    pinnedVersion?.filename
    ?? buildFilename({ prefix, name: newName, version: versionNum, ext: 'md' }),
  );
  const cardKey = folderPathDirname(pinnedRelativePath)
    ? cardKeyFromFilename(pinnedRelativePath)
    : parsed.fullBase;

  return {
    ok: true,
    versions: updatedVersions,
    cardUpdates: {
      key: cardKey,
      name: newName,
      prefix: parsed.prefix,
      versions: updatedVersions,
      ...cardPathFieldsFromVersion(pinnedVersion),
    },
  };
}
