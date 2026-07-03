import {
  folderPathBasename,
  folderPathDirname,
  normalizeFolderRelativePath,
  parseFilename,
} from './filename.js';

const PACKAGE_SUBDIRS = ['textures', 'images', 'materials', 'texture'];
const PACKAGE_SIDECAR_NAMES = new Set([
  'license.txt',
  'readme.txt',
  'readme.md',
]);

function shouldRewriteGltfUri(uri) {
  const value = String(uri ?? '').trim();
  if (!value) return false;
  return !/^(data:|blob:|https?:|file:)/i.test(value);
}

function resolveRelativeAssetPath(modelRelativePath, uri) {
  const cleanUri = decodeURIComponent(String(uri ?? '').split(/[?#]/)[0]).replace(/\\/g, '/');
  const baseDir = folderPathDirname(normalizeFolderRelativePath(modelRelativePath));
  const parts = [...baseDir.split('/'), ...cleanUri.split('/')]
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function rowRelativePath(row) {
  return normalizeFolderRelativePath(row?.relativePath ?? row?.filename ?? '');
}

function rowModelExt(row) {
  return parseFilename(folderPathBasename(rowRelativePath(row))).ext;
}

function isModelRootExt(ext) {
  return ext === 'gltf' || ext === 'glb';
}

/**
 * @param {object} gltfJson
 * @param {string} gltfRelativePath
 * @returns {string[]}
 */
export function parseGltfCompanionPaths(gltfJson, gltfRelativePath) {
  const paths = new Set();
  const entries = [
    ...(gltfJson?.buffers ?? []),
    ...(gltfJson?.images ?? []),
  ];
  for (const entry of entries) {
    if (!shouldRewriteGltfUri(entry?.uri)) continue;
    paths.add(resolveRelativeAssetPath(gltfRelativePath, entry.uri));
  }
  return [...paths];
}

function parseGltfJsonFromRow(row) {
  if (row?.gltfJsonText) {
    try {
      return JSON.parse(row.gltfJsonText);
    } catch {
      return null;
    }
  }
  if (row?.content && String(row.content).trim().startsWith('{')) {
    try {
      return JSON.parse(row.content);
    } catch {
      return null;
    }
  }
  return null;
}

function gltfBasenameWithoutExt(relativePath) {
  const base = folderPathBasename(normalizeFolderRelativePath(relativePath));
  const dotIdx = base.lastIndexOf('.');
  return dotIdx >= 0 ? base.slice(0, dotIdx) : base;
}

function isUnderPackageRoot(relativePath, packageRoot) {
  const normalizedPath = normalizeFolderRelativePath(relativePath);
  const normalizedRoot = normalizeFolderRelativePath(packageRoot);
  if (!normalizedPath || !normalizedRoot) return false;
  return normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isPackageSubdirPath(relativePath, packageRoot) {
  const normalizedPath = normalizeFolderRelativePath(relativePath);
  const normalizedRoot = normalizeFolderRelativePath(packageRoot);
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return false;
  const remainder = normalizedPath.slice(normalizedRoot.length + 1);
  const firstSegment = remainder.split('/')[0]?.toLowerCase() ?? '';
  return PACKAGE_SUBDIRS.includes(firstSegment);
}

function isPackageSidecarPath(relativePath, packageRoot, singleModelInRoot) {
  if (!singleModelInRoot) return false;
  const normalizedPath = normalizeFolderRelativePath(relativePath);
  const normalizedRoot = normalizeFolderRelativePath(packageRoot);
  if (folderPathDirname(normalizedPath) !== normalizedRoot) return false;
  const base = folderPathBasename(normalizedPath).toLowerCase();
  return PACKAGE_SIDECAR_NAMES.has(base);
}

function binSiblingPath(gltfRelativePath) {
  const normalized = normalizeFolderRelativePath(gltfRelativePath);
  const dir = folderPathDirname(normalized);
  const base = gltfBasenameWithoutExt(normalized);
  const binName = `${base}.bin`;
  return dir ? `${dir}/${binName}` : binName;
}

/** Unique sync key per 3D package folder (avoids filename collisions across models). */
export function gltfPackageCardKey(packageRoot, displayName) {
  const baseKey = `general__${displayName}`;
  const normalizedRoot = normalizeFolderRelativePath(packageRoot);
  return normalizedRoot ? `${normalizedRoot}/${baseKey}` : baseKey;
}

function isBinInModelPackageDirectory(relativePath, packages) {
  const normalizedPath = normalizeFolderRelativePath(relativePath);
  if (!normalizedPath.toLowerCase().endsWith('.bin')) return false;
  const dir = folderPathDirname(normalizedPath);
  return packages.some((pkg) => folderPathDirname(pkg.rootModelPath) === dir);
}

/**
 * @typedef {{
 *   packageRoot: string,
 *   rootModelPath: string,
 *   companionPaths: Set<string>,
 *   displayName: string,
 *   singleModelInRoot: boolean,
 * }} ThreeDPackageDescriptor
 */

/**
 * @param {Array<{ relativePath?: string, filename?: string, gltfJsonText?: string, content?: string }>} found
 * @returns {ThreeDPackageDescriptor[]}
 */
export function buildGltfPackageDescriptors(found) {
  const modelRows = (found ?? []).filter((row) => isModelRootExt(rowModelExt(row)));

  const modelCountByRoot = new Map();
  for (const row of modelRows) {
    const modelPath = rowRelativePath(row);
    const packageRoot = folderPathDirname(modelPath);
    modelCountByRoot.set(packageRoot, (modelCountByRoot.get(packageRoot) ?? 0) + 1);
  }

  return modelRows.map((row) => {
    const rootModelPath = rowRelativePath(row);
    const modelExt = rowModelExt(row);
    const packageRoot = folderPathDirname(rootModelPath);
    const displayName = packageRoot
      ? folderPathBasename(packageRoot)
      : gltfBasenameWithoutExt(rootModelPath);
    const singleModelInRoot = (modelCountByRoot.get(packageRoot) ?? 0) === 1;
    const companionPaths = new Set();

    if (modelExt === 'gltf') {
      for (const path of parseGltfCompanionPaths(parseGltfJsonFromRow(row), rootModelPath)) {
        companionPaths.add(path);
      }
      companionPaths.add(binSiblingPath(rootModelPath));
    }

    let companionFileCount = 0;
    for (const rowCandidate of found ?? []) {
      const candidatePath = rowRelativePath(rowCandidate);
      if (!candidatePath || candidatePath === rootModelPath) continue;
      if (!isUnderPackageRoot(candidatePath, packageRoot)) continue;
      companionFileCount += 1;
      if (singleModelInRoot) {
        companionPaths.add(candidatePath);
      } else if (isPackageSubdirPath(candidatePath, packageRoot)) {
        companionPaths.add(candidatePath);
      }
    }

    const isPackage = Boolean(packageRoot)
      && (modelExt === 'gltf' || companionFileCount > 0);

    return {
      packageRoot,
      rootModelPath,
      companionPaths,
      displayName,
      singleModelInRoot,
      isPackage,
    };
  }).filter((pkg) => pkg.isPackage);
}

/**
 * @param {string} relativePath
 * @param {ThreeDPackageDescriptor[]} packages
 * @returns {boolean}
 */
export function isGltfPackageCompanionPath(relativePath, packages) {
  const normalizedPath = normalizeFolderRelativePath(relativePath);
  if (!normalizedPath) return false;

  for (const pkg of packages) {
    if (normalizedPath === pkg.rootModelPath) return false;

    if (pkg.singleModelInRoot && isUnderPackageRoot(normalizedPath, pkg.packageRoot)) {
      return true;
    }

    if (pkg.companionPaths.has(normalizedPath)) return true;
    if (isPackageSubdirPath(normalizedPath, pkg.packageRoot)) return true;
    if (isPackageSidecarPath(normalizedPath, pkg.packageRoot, pkg.singleModelInRoot)) {
      return true;
    }
  }
  return isBinInModelPackageDirectory(normalizedPath, packages);
}

/**
 * @param {Array<Record<string, unknown>>} found
 * @returns {Array<Record<string, unknown>>}
 */
export function collapseGltfPackageFiles(found) {
  const packages = buildGltfPackageDescriptors(found);
  if (packages.length === 0) return found ?? [];

  const packageByModelPath = new Map(
    packages.map((pkg) => [pkg.rootModelPath, pkg]),
  );

  return (found ?? [])
    .filter((row) => {
      const relativePath = rowRelativePath(row);
      return !isGltfPackageCompanionPath(relativePath, packages);
    })
    .map((row) => {
      const relativePath = rowRelativePath(row);
      const pkg = packageByModelPath.get(relativePath);
      if (!pkg) return row;

      return {
        ...row,
        cardKey: gltfPackageCardKey(pkg.packageRoot, pkg.displayName),
        threeDPackageRoot: pkg.packageRoot,
        threeDIsPackage: true,
        prefix: 'general',
        name: pkg.displayName,
        gltfJsonText: undefined,
      };
    });
}
