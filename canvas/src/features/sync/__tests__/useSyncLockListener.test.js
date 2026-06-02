import { describe, it, expect } from 'vitest';
import { useSyncLockListener } from '../useSyncLockListener.js';
import { useSyncStreams } from '../useSyncStreams.js';
import { useWorkspaceIndexSync } from '../useWorkspaceIndexSync.js';
import { useActionSync } from '../useActionSync.js';
import { useVisibilitySync } from '../useVisibilitySync.js';
import { usePageHideFlush } from '../usePageHideFlush.js';
import { useProjectCacheEviction } from '../useProjectCacheEviction.js';

describe('feature sync hooks', () => {
  it('exports all Phase 1 sync hooks', () => {
    expect(typeof useSyncLockListener).toBe('function');
    expect(typeof useSyncStreams).toBe('function');
    expect(typeof useWorkspaceIndexSync).toBe('function');
    expect(typeof useActionSync).toBe('function');
    expect(typeof useVisibilitySync).toBe('function');
    expect(typeof usePageHideFlush).toBe('function');
    expect(typeof useProjectCacheEviction).toBe('function');
  });
});
