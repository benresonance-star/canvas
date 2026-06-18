import { describe, it, expect } from 'vitest';
import { useProjectSyncLifecycle } from '../useProjectSyncLifecycle.js';
import {
  folderRepairScanOptions,
  folderScanBaselineForProject,
  folderScanOwnsProject,
  folderPresentKeysForSuccessfulScan,
  shouldRepairFolderWithPicker,
  shouldSyncCanvasFromServerAfterFolderFlow,
  useFolderLinkScan,
} from '../useFolderLinkScan.js';
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

  it('uses auto-apply folder repair scan options', () => {
    expect(folderRepairScanOptions({ projectId: 'p1', baseCards: [] })).toEqual({
      projectId: 'p1',
      baseCards: [],
      skipPlacementDefer: true,
      autoApplyImport: true,
      preferImportDialog: true,
    });
  });

  it('keeps post-folder server reconcile out of repair scans', () => {
    expect(shouldSyncCanvasFromServerAfterFolderFlow('connect')).toBe(true);
    expect(shouldSyncCanvasFromServerAfterFolderFlow('repair')).toBe(false);
    expect(shouldSyncCanvasFromServerAfterFolderFlow('changeFolderKeep')).toBe(false);
  });

  it('falls back to picker when stored repair cannot reuse access', () => {
    expect(shouldRepairFolderWithPicker('not_stored')).toBe(true);
    expect(shouldRepairFolderWithPicker('denied')).toBe(true);
    expect(shouldRepairFolderWithPicker('other')).toBe(false);
    expect(shouldRepairFolderWithPicker(null)).toBe(false);
  });

  it('preserves canvas presence but excludes dock rows from successful scan presence', () => {
    expect(
      folderPresentKeysForSuccessfulScan(
        [],
        [{ key: 'notes__old', type: 'markdown', versions: [] }],
        { replaceCanvas: true, foundCount: 0 },
      ),
    ).toEqual([]);
    expect(
      folderPresentKeysForSuccessfulScan(
        [],
        [{ key: 'notes__old', type: 'markdown', versions: [] }],
        { replaceCanvas: false, foundCount: 0 },
      ),
    ).toEqual(['notes__old']);
  });

  it('only lets folder scans mutate their active project', () => {
    expect(folderScanOwnsProject('p1', 'p1', false)).toBe(true);
    expect(folderScanOwnsProject('p1', 'p2', false)).toBe(false);
    expect(folderScanOwnsProject('p1', 'p1', true)).toBe(false);
  });

  it('does not borrow current cards for a scan targeting another project', () => {
    const currentCards = [{ id: 'old-card', key: 'old' }];
    expect(folderScanBaselineForProject({
      projectId: 'p2',
      activeProjectId: 'p1',
      currentCards,
    })).toEqual([]);
    expect(folderScanBaselineForProject({
      projectId: 'p1',
      activeProjectId: 'p1',
      currentCards,
    })).toEqual(currentCards);
    expect(folderScanBaselineForProject({
      baseCards: [{ id: 'explicit', key: 'explicit' }],
      projectId: 'p2',
      activeProjectId: 'p1',
      currentCards,
    })).toEqual([{ id: 'explicit', key: 'explicit' }]);
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
