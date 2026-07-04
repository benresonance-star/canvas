import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';
import { isBlobUrl } from '../../../lib/previewUrl.js';

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

export function useBimModelSource(version, { folderHandle = null } = {}) {
  const [source, setSource] = useState({ blob: null, loading: false, error: null });
  const objectUrlRef = useRef(null);

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const load = useCallback(async () => {
    setSource((state) => ({ ...state, loading: true, error: null }));
    try {
      const blob = await resolveVersionBlob(version, folderHandle);
      if (!blob) throw new Error('IFC source file is not available. Reconnect the project folder and try again.');
      const arrayBuffer = await blob.arrayBuffer();
      clearObjectUrl();
      objectUrlRef.current = URL.createObjectURL(blob);
      const next = { blob, arrayBuffer, objectUrl: objectUrlRef.current, loading: false, error: null };
      setSource(next);
      return next;
    } catch (error) {
      const next = { blob: null, arrayBuffer: null, objectUrl: null, loading: false, error: error?.message || 'Could not load IFC source' };
      setSource(next);
      return next;
    }
  }, [clearObjectUrl, folderHandle, version]);

  useEffect(() => {
    void load();
    return clearObjectUrl;
  }, [clearObjectUrl, load]);

  return { ...source, reload: load };
}
