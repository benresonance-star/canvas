import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_ACTIONS,
  ARCHITECTURE_NODES,
  ARCHITECTURE_PIPES,
} from '../architectureGraph.js';
import { getArchitectureActionById, getActionTouchedEdgeIds, getActionTouchedNodeIds } from '../architectureActions.js';
import { buildDiagnosticsLayout3d } from '../diagnosticsLayout3d.js';
import {
  buildConcentratedActionLayout,
  computeLayout3dBounds,
  getActionConcentrateMembership,
  interpolateDiagnosticsLayout3d,
  applyConcentrateNodeOverrides,
} from '../diagnosticsConcentrateLayout.js';
import { computeDiagnosticsSceneBounds } from '../../../features/diagnostics/webgl/diagnosticsWebGLCamera.js';

describe('getActionTouchedEdgeIds', () => {
  it('collects all edge ids across action steps', () => {
    const action = getArchitectureActionById('add_note');
    const edgeIds = getActionTouchedEdgeIds(action);
    expect(edgeIds.size).toBeGreaterThan(0);
    expect(edgeIds.has('pipe-addMenu-newNoteDialog')).toBe(true);
    expect(edgeIds.has('pipe-apiCanvasProjects-dbCanvasProjectDocument')).toBe(true);
  });
});

describe('buildConcentratedActionLayout', () => {
  const action = getArchitectureActionById('add_note');
  const baseLayout3d = buildDiagnosticsLayout3d(ARCHITECTURE_NODES);

  it('includes only action nodes and edges', () => {
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });

    expect(concentrateLayout.visibleNodeIds).toEqual(getActionTouchedNodeIds(action));
    expect(concentrateLayout.visibleEdgeIds).toEqual(getActionTouchedEdgeIds(action));
    expect(concentrateLayout.byNodeId.size).toBe(concentrateLayout.visibleNodeIds.size);
    expect(concentrateLayout.layerPlanes).toEqual([]);
  });

  it('produces a tighter bounding radius than the full diagram', () => {
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });

    const fullBounds = computeDiagnosticsSceneBounds(baseLayout3d);
    const clusterBounds = computeLayout3dBounds(
      concentrateLayout,
      concentrateLayout.visibleNodeIds,
    );

    expect(clusterBounds.radius).toBeLessThan(fullBounds.radius);
  });

  it('interpolates between base and concentrate layouts', () => {
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    const membership = getActionConcentrateMembership(action, ARCHITECTURE_PIPES);
    const mid = interpolateDiagnosticsLayout3d(
      baseLayout3d,
      concentrateLayout,
      0.5,
      membership.visibleNodeIds,
    );

    const nodeId = [...membership.visibleNodeIds][0];
    const baseWorld = baseLayout3d.byNodeId.get(nodeId)?.world;
    const targetWorld = concentrateLayout.byNodeId.get(nodeId)?.world;
    const midWorld = mid.byNodeId.get(nodeId)?.world;

    expect(midWorld.x).toBeCloseTo((baseWorld.x + targetWorld.x) / 2, 4);
    expect(midWorld.z).toBeCloseTo((baseWorld.z + targetWorld.z) / 2, 4);
  });

  it('applies user drag overrides on top of concentrate layout', () => {
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    const nodeId = [...concentrateLayout.visibleNodeIds][0];
    const baseEntry = concentrateLayout.byNodeId.get(nodeId);
    expect(baseEntry).toBeTruthy();

    const overridden = applyConcentrateNodeOverrides(concentrateLayout, {
      [nodeId]: { centerX: baseEntry.flow.centerX + 80, centerY: baseEntry.flow.centerY + 40 },
    });
    const nextEntry = overridden.byNodeId.get(nodeId);
    expect(nextEntry.flow.centerX).toBe(baseEntry.flow.centerX + 80);
    expect(nextEntry.flow.centerY).toBe(baseEntry.flow.centerY + 40);
    expect(nextEntry.world.x).not.toBe(baseEntry.world.x);
  });

  it('interpolates toward overridden concentrate target', () => {
    const concentrateLayout = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    const nodeId = [...concentrateLayout.visibleNodeIds][0];
    const baseEntry = concentrateLayout.byNodeId.get(nodeId);
    const targetLayout = applyConcentrateNodeOverrides(concentrateLayout, {
      [nodeId]: { centerX: baseEntry.flow.centerX + 120, centerY: baseEntry.flow.centerY + 60 },
    });
    const membership = getActionConcentrateMembership(action, ARCHITECTURE_PIPES);
    const mid = interpolateDiagnosticsLayout3d(
      baseLayout3d,
      targetLayout,
      0.5,
      membership.visibleNodeIds,
    );

    const autoWorld = concentrateLayout.byNodeId.get(nodeId)?.world;
    const targetWorld = targetLayout.byNodeId.get(nodeId)?.world;
    const midWorld = mid.byNodeId.get(nodeId)?.world;

    expect(midWorld.x).toBeCloseTo((baseLayout3d.byNodeId.get(nodeId)?.world.x + targetWorld.x) / 2, 4);
    expect(Math.abs(midWorld.x - autoWorld.x)).toBeGreaterThan(1);
  });
});
