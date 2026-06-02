import { useEffect } from 'react';
import { requestActionSync, isServerSyncEnabled } from '../../lib/projects.js';
import { runExclusive } from '../../lib/projectSyncCoordinator.js';

/**
 * Tab visibility resume — refresh index and reconcile active project.
 */
export function useVisibilitySync({
  loaded,
  activeProjectIdRef,
  refreshProjectListFromServer,
  refreshClusterApiHealth,
}) {
  useEffect(() => {
    if (!loaded) return undefined;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void runExclusive('visibility', async () => {
        await refreshClusterApiHealth();
        await refreshProjectListFromServer();
        const projectId = activeProjectIdRef.current;
        if (projectId && isServerSyncEnabled()) {
          void requestActionSync('visibilityResume', { projectId });
        }
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [
    loaded,
    refreshProjectListFromServer,
    refreshClusterApiHealth,
    activeProjectIdRef,
  ]);
}
