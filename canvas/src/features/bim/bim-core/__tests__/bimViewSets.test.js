import { describe, expect, it } from 'vitest';
import {
  addBimViewToSet,
  applyBimViewStatePatch,
  createBimViewFromWorkspaceState,
  createBimViewSet,
  deleteBimViewFromSets,
  ensureDefaultViewSet,
  findBimView,
  normalizeBimViewSets,
  updateBimViewInSets,
} from '../bimViewSets.js';
import { normalizeBimWorkspaceState } from '../types.js';

const sampleCamera = {
  position: [10, 8, 10],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fov: 45,
  zoom: 1,
};

const sampleWorkspace = {
  camera: sampleCamera,
  projectionMode: 'perspective',
  viewportBackgroundColor: '#ffffff',
  section: { enabled: true, planes: [] },
  hiddenStoreys: ['Level 02'],
  hiddenLayers: ['Structure'],
  displayMode: 'ghostOthers',
  renderStyle: 'clay',
};

describe('bimViewSets', () => {
  it('creates a view from workspace state', () => {
    const view = createBimViewFromWorkspaceState({
      label: 'Plan A',
      workspaceState: sampleWorkspace,
    });
    expect(view).toMatchObject({
      label: 'Plan A',
      state: expect.objectContaining({
        projectionMode: 'perspective',
        viewportBackgroundColor: '#ffffff',
        displayMode: 'ghostOthers',
        renderStyle: 'clay',
      }),
    });
    expect(view.state.camera).toEqual(expect.objectContaining({
      position: sampleCamera.position,
      target: sampleCamera.target,
    }));
  });

  it('normalizes view sets and enforces limits', () => {
    const sets = normalizeBimViewSets([
      {
        id: 'set-1',
        name: 'PLANS',
        views: Array.from({ length: 45 }, (_, index) => ({
          id: `view-${index}`,
          label: `View ${index}`,
          thumbnailKey: `thumb-${index}`,
          state: { camera: sampleCamera },
        })),
      },
    ]);
    expect(sets).toHaveLength(1);
    expect(sets[0].views.length).toBeLessThanOrEqual(40);
  });

  it('updates view label through updateBimViewInSets', () => {
    const set = createBimViewSet({ name: 'PLANS' });
    const view = createBimViewFromWorkspaceState({ label: 'Plan 1', workspaceState: sampleWorkspace });
    let sets = addBimViewToSet([set], set.id, view);
    sets = updateBimViewInSets(sets, view.id, { label: 'Ground Floor' });
    expect(findBimView(sets, view.id).view.label).toBe('Ground Floor');
  });

  it('adds and deletes views in a set', () => {
    const set = createBimViewSet({ name: 'Sections' });
    const view = createBimViewFromWorkspaceState({ label: 'Section 1', workspaceState: sampleWorkspace });
    let sets = addBimViewToSet([set], set.id, view);
    expect(sets[0].views).toHaveLength(1);
    sets = deleteBimViewFromSets(sets, view.id);
    expect(sets[0].views).toHaveLength(0);
  });

  it('extracts a workspace patch from saved view state', () => {
    const view = createBimViewFromWorkspaceState({ label: 'Plan', workspaceState: sampleWorkspace });
    const patch = applyBimViewStatePatch(view.state);
    expect(patch).toMatchObject({
      projectionMode: 'perspective',
      viewportBackgroundColor: '#ffffff',
      hiddenStoreys: ['Level 02'],
      hiddenLayers: ['Structure'],
      displayMode: 'ghostOthers',
    });
    expect(patch.camera).toEqual(expect.objectContaining({ fov: 45 }));
  });

  it('seeds a default view set when empty', () => {
    expect(ensureDefaultViewSet([])).toEqual([
      expect.objectContaining({ name: 'Views', views: [] }),
    ]);
  });

  it('preserves collapsed panels when applying a functional workspace patch', () => {
    const state = normalizeBimWorkspaceState({
      panels: { left: false, right: false },
      viewCarouselOpen: false,
      viewSets: [{ id: 'set-1', name: 'PLANS', views: [] }],
    });
    const next = normalizeBimWorkspaceState({
      ...state,
      viewCarouselOpen: state.viewCarouselOpen !== true,
    });
    expect(next.viewCarouselOpen).toBe(true);
    expect(next.panels).toEqual({ left: false, right: false });
    expect(next.viewSets).toHaveLength(1);
  });

  it('captures wireframe and orthographic camera settings in view state', () => {
    const orthoCamera = {
      position: [0, 40, 0],
      target: [0, 0, 0],
      up: [0, 0, -1],
      zoom: 1.2,
      viewHeight: 18,
    };
    const view = createBimViewFromWorkspaceState({
      label: 'Iso wireframe',
      workspaceState: {
        ...sampleWorkspace,
        wireframeMode: true,
        wireframeLineWeight: 3,
        wireframeOpacity: 0.5,
        wireframeColor: '#ff0000',
        wireframeHiddenLines: false,
        projectionMode: 'orthographic',
      },
      liveSnapshot: {
        camera: orthoCamera,
        projectionMode: 'orthographic',
      },
    });
    expect(view.state).toMatchObject({
      wireframeMode: true,
      wireframeLineWeight: 3,
      wireframeOpacity: 0.5,
      wireframeColor: '#ff0000',
      wireframeHiddenLines: false,
      projectionMode: 'orthographic',
    });
    expect(view.state.camera).toEqual(expect.objectContaining({
      position: orthoCamera.position,
      zoom: 1.2,
      viewHeight: 18,
    }));
    const patch = applyBimViewStatePatch(view.state);
    expect(patch.wireframeMode).toBe(true);
    expect(patch.projectionMode).toBe('orthographic');
  });

  it('prefers live camera snapshot over stale workspace camera', () => {
    const liveCamera = {
      position: [5, 5, 5],
      target: [1, 0, 1],
      up: [0, 1, 0],
      fov: 30,
      zoom: 1,
    };
    const view = createBimViewFromWorkspaceState({
      label: 'Live angle',
      workspaceState: {
        ...sampleWorkspace,
        camera: sampleCamera,
        projectionMode: 'perspective',
      },
      liveSnapshot: {
        camera: liveCamera,
        projectionMode: 'perspective',
      },
    });
    expect(view.state.camera).toEqual(expect.objectContaining({
      position: liveCamera.position,
      fov: 30,
    }));
  });

  it('persists view fields through workspace normalization', () => {
    const view = createBimViewFromWorkspaceState({ label: 'Ground', workspaceState: sampleWorkspace });
    const set = createBimViewSet({ name: 'PLANS' });
    const state = normalizeBimWorkspaceState({
      viewSets: addBimViewToSet([set], set.id, view),
      activeViewSetId: set.id,
      activeViewId: view.id,
      viewCarouselOpen: true,
    });
    expect(state.viewCarouselOpen).toBe(true);
    expect(state.activeViewSetId).toBe(set.id);
    expect(state.activeViewId).toBe(view.id);
    expect(state.viewSets[0].views[0].label).toBe('Ground');
  });
});
