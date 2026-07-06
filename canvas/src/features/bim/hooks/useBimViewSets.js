import { useCallback, useMemo, useState } from 'react';
import {
  addBimViewToSet,
  applyBimViewStatePatch,
  createBimViewFromWorkspaceState,
  createBimViewSet,
  deleteBimViewFromSets,
  deleteBimViewSetFromSets,
  ensureDefaultViewSet,
  findBimView,
  renameBimViewSet,
  resolveActiveViewSetId,
  updateBimViewInSets,
} from '../bim-core/bimViewSets.js';

export function useBimViewSets({
  workspaceState,
  patchWorkspaceState,
  repository,
  captureViewportThumbnail,
  captureViewportState,
}) {
  const [viewApplyRequest, setViewApplyRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const viewSets = workspaceState.viewSets ?? [];
  const activeViewSetId = resolveActiveViewSetId(viewSets, workspaceState.activeViewSetId);
  const activeViewSet = useMemo(
    () => viewSets.find((set) => set.id === activeViewSetId) ?? null,
    [activeViewSetId, viewSets],
  );
  const activeViewId = workspaceState.activeViewId ?? null;

  const patchViewSets = useCallback((updater) => {
    patchWorkspaceState((state) => ({
      viewSets: updater(state.viewSets ?? []),
    }));
  }, [patchWorkspaceState]);

  const setActiveViewSetId = useCallback((setId) => {
    patchWorkspaceState({ activeViewSetId: setId || null });
  }, [patchWorkspaceState]);

  const toggleViewCarousel = useCallback(() => {
    patchWorkspaceState((state) => ({
      viewCarouselOpen: state.viewCarouselOpen !== true,
    }));
  }, [patchWorkspaceState]);

  const persistThumbnail = useCallback(async (key, blob) => {
    if (!repository?.putViewThumbnail || !key || !blob) return;
    await repository.putViewThumbnail(key, blob);
  }, [repository]);

  const removeThumbnail = useCallback(async (key) => {
    if (!repository?.deleteViewThumbnail || !key) return;
    await repository.deleteViewThumbnail(key);
  }, [repository]);

  const createViewSet = useCallback((name) => {
    const nextSet = createBimViewSet({
      name: name?.trim() || 'Views',
      order: viewSets.length,
    });
    if (!nextSet) return null;
    patchWorkspaceState((state) => ({
      viewSets: [...(state.viewSets ?? []), nextSet],
      activeViewSetId: nextSet.id,
    }));
    setStatus(`Created set "${nextSet.name}".`);
    return nextSet;
  }, [patchWorkspaceState, viewSets.length]);

  const renameViewSet = useCallback((setId, name) => {
    patchViewSets((sets) => renameBimViewSet(sets, setId, name));
    setStatus('View set renamed.');
  }, [patchViewSets]);

  const deleteViewSet = useCallback(async (setId) => {
    const target = viewSets.find((set) => set.id === setId);
    if (!target) return;
    await Promise.all(
      target.views.map((view) => removeThumbnail(view.thumbnailKey)),
    );
    patchWorkspaceState((state) => {
      const nextSets = deleteBimViewSetFromSets(state.viewSets ?? [], setId);
      const nextActiveViewSetId = resolveActiveViewSetId(nextSets, state.activeViewSetId);
      const nextActiveViewId = nextSets.some((set) => set.views.some((view) => view.id === state.activeViewId))
        ? state.activeViewId
        : null;
      return {
        viewSets: nextSets,
        activeViewSetId: nextActiveViewSetId,
        activeViewId: nextActiveViewId,
      };
    });
    setStatus('View set deleted.');
  }, [patchWorkspaceState, removeThumbnail, viewSets]);

  const saveCurrentView = useCallback(async ({ label, setId = activeViewSetId } = {}) => {
    setBusy(true);
    setError('');
    try {
      const liveSnapshot = captureViewportState?.() ?? null;
      const view = createBimViewFromWorkspaceState({
        label: label?.trim() || 'View',
        workspaceState,
        liveSnapshot,
      });
      if (!view) throw new Error('Could not capture view state.');
      const blob = await captureViewportThumbnail?.();
      if (blob) {
        await persistThumbnail(view.thumbnailKey, blob);
      }
      patchWorkspaceState((state) => {
        let nextSets = ensureDefaultViewSet(state.viewSets ?? []);
        const resolvedSetId = resolveActiveViewSetId(nextSets, setId) ?? nextSets[0]?.id;
        if (!resolvedSetId) {
          const created = createBimViewSet({ name: 'Views', order: 0 });
          nextSets = [created];
        }
        const targetSetId = resolveActiveViewSetId(nextSets, setId) ?? nextSets[0]?.id;
        return {
          viewSets: addBimViewToSet(nextSets, targetSetId, view),
          activeViewSetId: targetSetId,
          activeViewId: view.id,
        };
      });
      setStatus(`Saved view "${view.label}".`);
      return view;
    } catch (err) {
      setError(err?.message || 'Could not save view.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [
    activeViewSetId,
    captureViewportState,
    captureViewportThumbnail,
    patchWorkspaceState,
    persistThumbnail,
    workspaceState,
  ]);

  const updateViewFromCurrent = useCallback(async (viewId) => {
    setBusy(true);
    setError('');
    try {
      const { view } = findBimView(viewSets, viewId);
      if (!view) throw new Error('View not found.');
      const liveSnapshot = captureViewportState?.() ?? null;
      const nextState = createBimViewFromWorkspaceState({
        label: view.label,
        workspaceState,
        liveSnapshot,
        thumbnailKey: view.thumbnailKey,
      });
      const blob = await captureViewportThumbnail?.();
      if (blob) {
        await persistThumbnail(view.thumbnailKey, blob);
      }
      patchViewSets((sets) => updateBimViewInSets(sets, viewId, {
        state: nextState.state,
      }));
      patchWorkspaceState({ activeViewId: viewId });
      setStatus(`Updated view "${view.label}".`);
    } catch (err) {
      setError(err?.message || 'Could not update view.');
    } finally {
      setBusy(false);
    }
  }, [
    captureViewportState,
    captureViewportThumbnail,
    patchViewSets,
    patchWorkspaceState,
    persistThumbnail,
    viewSets,
    workspaceState,
  ]);

  const renameView = useCallback((viewId, label) => {
    const trimmed = String(label ?? '').trim();
    if (!trimmed) {
      setError('View label cannot be empty.');
      return;
    }
    patchViewSets((sets) => updateBimViewInSets(sets, viewId, { label: trimmed }));
    setError('');
    setStatus('View renamed.');
  }, [patchViewSets]);

  const deleteView = useCallback(async (viewId) => {
    const { view } = findBimView(viewSets, viewId);
    if (view) {
      await removeThumbnail(view.thumbnailKey);
    }
    patchWorkspaceState((state) => ({
      viewSets: deleteBimViewFromSets(state.viewSets ?? [], viewId),
      activeViewId: state.activeViewId === viewId ? null : state.activeViewId,
    }));
    setStatus('View deleted.');
  }, [patchWorkspaceState, removeThumbnail, viewSets]);

  const applyView = useCallback((viewId) => {
    const { view, viewSet } = findBimView(viewSets, viewId);
    if (!view) {
      setError('View not found.');
      return;
    }
    const patch = applyBimViewStatePatch(view.state);
    patchWorkspaceState({
      ...patch,
      activeViewSetId: viewSet?.id ?? activeViewSetId,
      activeViewId: view.id,
    });
    setViewApplyRequest({
      token: Date.now(),
      camera: patch.camera,
      projectionMode: patch.projectionMode,
      wireframeMode: patch.wireframeMode === true,
    });
    setStatus(`Applied view "${view.label}".`);
  }, [activeViewSetId, patchWorkspaceState, viewSets]);

  const loadViewThumbnail = useCallback(async (thumbnailKey) => {
    if (!repository?.getViewThumbnail || !thumbnailKey) return null;
    return repository.getViewThumbnail(thumbnailKey);
  }, [repository]);

  return {
    viewSets,
    activeViewSetId,
    activeViewSet,
    activeViewId,
    viewCarouselOpen: workspaceState.viewCarouselOpen === true,
    viewApplyRequest,
    busy,
    status,
    error,
    setStatus,
    setError,
    toggleViewCarousel,
    setActiveViewSetId,
    createViewSet,
    renameViewSet,
    deleteViewSet,
    saveCurrentView,
    updateViewFromCurrent,
    renameView,
    deleteView,
    applyView,
    loadViewThumbnail,
  };
}
