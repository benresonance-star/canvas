import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreview } from '../../../lib/previewStore.js';
import { getFileHandleAtPath } from '../../../lib/folderWrite.js';

async function blobFromFolderPath(folderHandle, relativePath) {
  const handle = await getFileHandleAtPath(folderHandle, relativePath);
  const file = await handle.getFile();
  return new Blob([await file.arrayBuffer()], {
    type: file.type || 'application/x-step',
  });
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
      let blob = null;
      if (version?.objectUrl || version?.dataUrl) {
        blob = await fetch(version.objectUrl || version.dataUrl).then((response) => response.blob());
      } else if (version?.previewCacheKey) {
        blob = await getPreview(version.previewCacheKey);
      } else if (folderHandle && version?.relativePath) {
        blob = await blobFromFolderPath(folderHandle, version.relativePath);
      }
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
