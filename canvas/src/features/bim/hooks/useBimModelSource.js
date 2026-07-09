import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';
import { isBlobUrl } from '../../../lib/previewUrl.js';

export function isEmptyBimViewerVersion(version) {
  return version?.bim?.viewerKind === 'ifc-viewer-session';
}

async function blobFromFolderPath(folderHandle, relativePath) {
  const handle = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await handle.getFile();
  return new Blob([await file.arrayBuffer()], {
    type: file.type || 'application/x-step',
  });
}

async function resolveVersionBlob(version, folderHandle) {
  if (version?.previewCacheKey) {
    const cached = await getPreview(version.previewCacheKey);
    if (cached) return cached;
  }
  const remoteUrl = version?.objectUrl || version?.dataUrl;
  if (remoteUrl && !isBlobUrl(remoteUrl)) {
    const response = await fetch(remoteUrl);
    if (response.ok) return response.blob();
  }
  if (remoteUrl && isBlobUrl(remoteUrl)) {
    try {
      const response = await fetch(remoteUrl);
      if (response.ok) return response.blob();
    } catch {
      // Fall through to folder / preview cache retry below.
    }
    if (version?.previewCacheKey) {
      const cached = await getPreview(version.previewCacheKey);
      if (cached) return cached;
    }
  }
  if (folderHandle && version?.relativePath) {
    return blobFromFolderPath(folderHandle, version.relativePath);
  }
  return null;
}

/** Stable IFC source identity — ignores viewport/style patches on the version object. */
export function buildBimSourceIdentity(version) {
  if (!version) return '';
  if (isEmptyBimViewerVersion(version)) return `empty-ifc-viewer:${version?.bim?.session?.id ?? ''}`;
  return [
    version.content_hash ?? '',
    version.previewCacheKey ?? '',
    version.relativePath ?? '',
    version.objectUrl ?? '',
    version.dataUrl ?? '',
    version.filename ?? '',
  ].join('|');
}

export function useBimModelSource(version, { folderHandle = null } = {}) {
  const versionRef = useRef(version);
  versionRef.current = version;
  const sourceIdentity = buildBimSourceIdentity(version);
  const loadedIdentityRef = useRef(null);
  const [source, setSource] = useState({
    blob: null,
    arrayBuffer: null,
    objectUrl: null,
    loading: false,
    error: null,
  });
  const objectUrlRef = useRef(null);

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const load = useCallback(async ({ force = false } = {}) => {
    if (isEmptyBimViewerVersion(versionRef.current)) {
      clearObjectUrl();
      loadedIdentityRef.current = sourceIdentity;
      const next = {
        blob: null,
        arrayBuffer: null,
        objectUrl: null,
        loading: false,
        error: null,
      };
      setSource(next);
      return next;
    }

    if (!force && loadedIdentityRef.current === sourceIdentity) {
      return;
    }

    setSource((state) => {
      if (!force && loadedIdentityRef.current === sourceIdentity && state.arrayBuffer) {
        return state;
      }
      return { ...state, loading: true, error: null };
    });

    try {
      const blob = await resolveVersionBlob(versionRef.current, folderHandle);
      if (!blob) throw new Error('IFC source file is not available. Reconnect the project folder and try again.');
      const arrayBuffer = await blob.arrayBuffer();
      clearObjectUrl();
      objectUrlRef.current = URL.createObjectURL(blob);
      loadedIdentityRef.current = sourceIdentity;
      const next = {
        blob,
        arrayBuffer,
        objectUrl: objectUrlRef.current,
        loading: false,
        error: null,
      };
      setSource(next);
      return next;
    } catch (error) {
      loadedIdentityRef.current = null;
      const next = {
        blob: null,
        arrayBuffer: null,
        objectUrl: null,
        loading: false,
        error: error?.message || 'Could not load IFC source',
      };
      setSource(next);
      return next;
    }
  }, [clearObjectUrl, folderHandle, sourceIdentity]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => clearObjectUrl(), [clearObjectUrl]);

  return { ...source, reload: () => load({ force: true }) };
}
