import { describe, it, expect } from 'vitest';
import { useProjectSyncLifecycle } from '../useProjectSyncLifecycle.js';
import { useFolderLinkScan } from '../useFolderLinkScan.js';
import { useAgentChatShell } from '../../agent/useAgentChatShell.js';
import { useClusterContext } from '../../cluster/useClusterContext.js';
import { useCanvasDocument } from '../../canvas/useCanvasDocument.js';
import { useProjectWorkspace } from '../../workspace/useProjectWorkspace.js';
import { CanvasWorkspaceView } from '../../workspace/CanvasWorkspaceView.jsx';
import { useAppShell } from '../../workspace/useAppShell.js';
import { buildWorkspaceViewBundles } from '../../workspace/buildWorkspaceViewBundles.js';

describe('Phase 1 feature hooks', () => {
  it('exports lifecycle, folder, and agent shell hooks', () => {
    expect(typeof useProjectSyncLifecycle).toBe('function');
    expect(typeof useFolderLinkScan).toBe('function');
    expect(typeof useAgentChatShell).toBe('function');
  });

  it('exports Phase 1b cluster, canvas, and workspace hooks', () => {
    expect(typeof useClusterContext).toBe('function');
    expect(typeof useCanvasDocument).toBe('function');
    expect(typeof useProjectWorkspace).toBe('function');
  });

  it('exports Phase 1c CanvasWorkspaceView', () => {
    expect(typeof CanvasWorkspaceView).toBe('function');
  });

  it('exports Phase 2 useAppShell', () => {
    expect(typeof useAppShell).toBe('function');
  });

  it('exports workspace view prop bundler', () => {
    expect(typeof buildWorkspaceViewBundles).toBe('function');
  });
});
