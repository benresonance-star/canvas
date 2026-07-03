import { describe, expect, it } from 'vitest';

import { ARCHITECTURE_NODES, ARCHITECTURE_PIPES } from '../architectureGraph.js';

import {
  buildDiagnosticsLayout3d,
  computeLayerFlowShelfExtent,
  flowPointToWorld,
  worldPointToFlow,
} from '../diagnosticsLayout3d.js';
import { computeDiagnosticsSceneBounds } from '../../../features/diagnostics/webgl/diagnosticsWebGLCamera.js';



describe('diagnosticsLayout3d', () => {

  const layout3d = buildDiagnosticsLayout3d(ARCHITECTURE_NODES);



  it('maps layer bands to flow Y positions on the flat plane', () => {

    expect(layout3d.layerPlanes[0].worldZ).toBeLessThan(layout3d.layerPlanes[1].worldZ);

    expect(layout3d.layerPlanes[0].worldDepth).toBeGreaterThan(0);

  });



  it('centers world coordinates around diagram center', () => {

    const entries = [...layout3d.byNodeId.values()];

    const avgX = entries.reduce((sum, entry) => sum + entry.world.x, 0) / entries.length;

    const avgZ = entries.reduce((sum, entry) => sum + entry.world.z, 0) / entries.length;

    expect(Math.abs(avgX)).toBeLessThan(0.05);

    expect(Math.abs(avgZ)).toBeLessThan(0.05);

  });



  it('round-trips flow and world points for a layer', () => {

    const nodeEntry = layout3d.byNodeId.get('addMenu');

    expect(nodeEntry).toBeTruthy();

    const world = flowPointToWorld(

      nodeEntry.flow.centerX,

      nodeEntry.flow.centerY,

      nodeEntry.flow.layerIndex,

      layout3d.centerX,

      layout3d.centerY,

    );

    const roundTrip = worldPointToFlow(world, nodeEntry.flow.layerIndex, layout3d.centerX, layout3d.centerY);

    expect(roundTrip.x).toBeCloseTo(nodeEntry.flow.centerX, 3);

    expect(roundTrip.y).toBeCloseTo(nodeEntry.flow.centerY, 3);

  });



  it('keeps interpolated edge points on the flat flow plane', () => {

    const source = layout3d.byNodeId.get('addMenu');

    const target = layout3d.byNodeId.get('useCanvasDocument');

    expect(source && target).toBeTruthy();

    const mid = flowPointToWorld(

      (source.flow.centerX + target.flow.centerX) / 2,

      (source.flow.centerY + target.flow.centerY) / 2,

      source.flow.layerIndex,

      layout3d.centerX,

      layout3d.centerY,

    );

    expect(mid.y).toBeCloseTo(source.world.y + 0.01, 3);

    expect(mid.z).toBeGreaterThan(Math.min(source.world.z, target.world.z) - 0.01);

    expect(mid.z).toBeLessThan(Math.max(source.world.z, target.world.z) + 0.01);

  });

  it('sizes layer shelves to flow group width instead of scene radius', () => {
    const bounds = computeDiagnosticsSceneBounds(layout3d);
    const inflatedShelfWidth = bounds.radius * 2.4;
    const firstLayer = layout3d.layerPlanes[0];

    expect(firstLayer.worldWidth).toBeGreaterThan(0);
    expect(firstLayer.worldWidth).toBeLessThan(inflatedShelfWidth);
    expect(firstLayer.label).toBeTruthy();
    expect(firstLayer.titleWorld).toBeTruthy();
  });

  it('matches 2D layer group width in flow coordinates', () => {
    const uiNodes = ARCHITECTURE_NODES.filter((node) => node.layer === 'client-ui').length;
    const flowExtent = computeLayerFlowShelfExtent(uiNodes);
    const uiPlane = layout3d.layerPlanes.find((plane) => plane.layer === 'client-ui');

    expect(flowExtent).toBeTruthy();
    expect(uiPlane).toBeTruthy();
    expect(uiPlane.worldWidth).toBeCloseTo(flowExtent.flowWidth * 0.012, 4);
  });

});

