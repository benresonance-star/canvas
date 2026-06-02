import { useEffect, useState } from 'react';
import { setSyncLockListener } from '../../lib/projectSync.js';
import { strings } from '../../content/strings.js';

/**
 * Sync lock state + server listener registration.
 * @param {object} params
 * @param {import('react').MutableRefObject<string | null>} params.activeProjectIdRef
 * @param {import('react').MutableRefObject<'live' | 'stale' | 'offline'>} params.syncLockRef
 * @param {import('react').MutableRefObject<'live' | 'stale' | 'offline'>} params.lastAppliedSyncLockRef
 */
export function useSyncLockListener({
  activeProjectIdRef,
  syncLockRef,
  lastAppliedSyncLockRef,
}) {
  const [syncLock, setSyncLock] = useState('live');
  const [syncStatus, setSyncStatus] = useState(null);

  useEffect(() => {
    syncLockRef.current = syncLock;
  }, [syncLock, syncLockRef]);

  useEffect(() => {
    setSyncLockListener((projectId, lock) => {
      if (projectId !== activeProjectIdRef.current) return;
      if (syncLockRef.current === lock) {
        lastAppliedSyncLockRef.current = lock;
        return;
      }
      lastAppliedSyncLockRef.current = lock;
      setSyncLock(lock);
      if (lock === 'live') {
        setSyncStatus((prev) =>
          prev?.banner === strings.projects.serverRevisionStale
            || prev?.banner === strings.projects.remoteChangesWhileEditing
            || prev?.banner === strings.projects.projectSyncConflict
            ? null
            : prev,
        );
      } else if (lock === 'stale') {
        setSyncStatus((prev) =>
          prev?.conflictActions
            ? prev
            : {
              banner: strings.projects.projectSyncConflict,
              conflictActions: true,
            },
        );
      } else if (lock === 'offline') {
        setSyncStatus((prev) =>
          prev?.banner ? prev : { banner: strings.projects.localOnlyBanner },
        );
      }
    });
    return () => setSyncLockListener(null);
  }, [activeProjectIdRef, syncLockRef, lastAppliedSyncLockRef]);

  return { syncLock, setSyncLock, syncStatus, setSyncStatus };
}
