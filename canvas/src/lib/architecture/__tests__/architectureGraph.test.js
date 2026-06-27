import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECTURE_NODES,
  ARCHITECTURE_PIPES,
  ARCHITECTURE_ACTIONS,
  getArchitectureGraphManifest,
  getArchitectureReactFlowEdges,
  collectArchitectureCodeRefs,
  ARCHITECTURE_ROUTE_MANIFEST,
} from '../index.js';
import { REQUIRED_NODE_FIELDS, REQUIRED_PIPE_FIELDS } from '../architectureGraphSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANVAS_ROOT = path.resolve(__dirname, '../../../..');

describe('architectureGraph', () => {
  it('has unique node and pipe ids', () => {
    const nodeIds = ARCHITECTURE_NODES.map((n) => n.id);
    const pipeIds = ARCHITECTURE_PIPES.map((p) => p.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(pipeIds).size).toBe(pipeIds.length);
  });

  it('has required metadata on every node', () => {
    for (const node of ARCHITECTURE_NODES) {
      for (const field of REQUIRED_NODE_FIELDS) {
        expect(node[field], `node ${node.id} missing ${field}`).toBeTruthy();
      }
      expect(node.purpose.length).toBeGreaterThan(10);
      expect(node.why.length).toBeGreaterThan(10);
    }
  });

  it('has required metadata on every pipe', () => {
    const nodeIds = new Set(ARCHITECTURE_NODES.map((n) => n.id));
    for (const pipe of ARCHITECTURE_PIPES) {
      for (const field of REQUIRED_PIPE_FIELDS) {
        expect(pipe[field], `pipe ${pipe.id} missing ${field}`).toBeTruthy();
      }
      expect(nodeIds.has(pipe.source)).toBe(true);
      expect(nodeIds.has(pipe.target)).toBe(true);
      expect(pipe.pipeLabel.length).toBeGreaterThan(0);
      expect(pipe.dataFlow.length).toBeGreaterThan(10);
    }
  });

  it('manifest reports graph inventory', () => {
    const manifest = getArchitectureGraphManifest();
    expect(manifest.nodeCount).toBeGreaterThanOrEqual(35);
    expect(manifest.pipeCount).toBeGreaterThanOrEqual(30);
    expect(manifest.actionCount).toBe(8);
  });

  it('assigns parallel metadata for multiple pipes between the same nodes', () => {
    const edges = getArchitectureReactFlowEdges();
    const reconcile = edges.filter(
      (e) => e.source === 'projectSyncDocument' && e.target === 'apiCanvasProjects',
    );
    expect(reconcile.length).toBe(2);
    expect(reconcile.every((e) => e.data.parallelTotal === 2)).toBe(true);
    expect(new Set(reconcile.map((e) => e.data.parallelIndex))).toEqual(new Set([0, 1]));
  });
});

describe('architectureActions', () => {
  const pipeIds = new Set(ARCHITECTURE_PIPES.map((p) => p.id));
  const nodeIds = new Set(ARCHITECTURE_NODES.map((n) => n.id));

  it('every action step references valid graph elements', () => {
    for (const action of ARCHITECTURE_ACTIONS) {
      if (action.mode === 'overview') continue;
      expect(action.steps.length).toBeGreaterThan(0);
      for (const step of action.steps) {
        for (const edgeId of step.edgeIds) {
          expect(pipeIds.has(edgeId), `${action.id} unknown edge ${edgeId}`).toBe(true);
        }
        for (const nodeId of step.activeNodeIds) {
          expect(nodeIds.has(nodeId), `${action.id} unknown node ${nodeId}`).toBe(true);
        }
      }
    }
  });
});

describe('architectureCodeRefs', () => {
  it('codeRef paths resolve under canvas/', () => {
    for (const ref of collectArchitectureCodeRefs()) {
      const full = path.join(CANVAS_ROOT, ref.replace(/\//g, path.sep));
      expect(fs.existsSync(full), `missing codeRef: ${ref}`).toBe(true);
    }
  });
});

describe('architectureRoutesParity', () => {
  it('route manifest graph nodes exist in architecture graph', () => {
    const nodeIds = new Set(ARCHITECTURE_NODES.map((n) => n.id));
    for (const route of ARCHITECTURE_ROUTE_MANIFEST) {
      expect(nodeIds.has(route.graphNodeId), `missing API node for ${route.id}`).toBe(true);
    }
  });
});
