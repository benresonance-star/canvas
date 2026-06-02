import { useEffect } from 'react';
import { loadProjectIndex, setCacheEvictionContext } from '../../lib/projects.js';

/**
 * Update LRU cache eviction context when active project or index changes.
 */
export function useProjectCacheEviction({ activeProjectId, projectListLength }) {
  useEffect(() => {
    void (async () => {
      const index = await loadProjectIndex();
      const ids = (index?.projects ?? []).map((p) => p.id).filter(Boolean);
      setCacheEvictionContext({
        activeProjectId: activeProjectId ?? null,
        indexProjectIds: ids,
      });
    })();
  }, [activeProjectId, projectListLength]);
}
