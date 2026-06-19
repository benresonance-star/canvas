import { describe, expect, it } from 'vitest';
import {
  flowPreviewRectsOverlap,
  resolveFlowPreviewOverlaps,
} from '../flowPreviewLayout.js';

describe('flowPreviewLayout', () => {
  it('flowPreviewRectsOverlap detects padded intersection', () => {
    const a = { x: 0, y: 0, width: 100, height: 80 };
    const b = { x: 90, y: 70, width: 100, height: 80 };
    expect(flowPreviewRectsOverlap(a, b, 0)).toBe(true);
    expect(flowPreviewRectsOverlap(a, b, 20)).toBe(true);
    expect(flowPreviewRectsOverlap(a, { x: 200, y: 200, width: 100, height: 80 }, 16)).toBe(false);
  });

  it('resolveFlowPreviewOverlaps separates Agent Runtime-like overlapping nodes', () => {
    const separated = resolveFlowPreviewOverlaps([
      { id: 'skills', x: 754, y: 256, width: 180, height: 80 },
      { id: 'tools', x: 1050, y: 318, width: 180, height: 80 },
    ], { gap: 16 });

    const skills = separated.find((node) => node.id === 'skills');
    const tools = separated.find((node) => node.id === 'tools');
    expect(skills).toBeTruthy();
    expect(tools).toBeTruthy();
    expect(flowPreviewRectsOverlap(skills, tools, 16)).toBe(false);
  });

  it('resolveFlowPreviewOverlaps leaves widely spaced nodes unchanged', () => {
    const input = [
      { id: 'a', x: 0, y: 0, width: 180, height: 80 },
      { id: 'b', x: 400, y: 300, width: 180, height: 80 },
    ];
    const separated = resolveFlowPreviewOverlaps(input, { gap: 16 });
    expect(separated[0].x).toBe(0);
    expect(separated[0].y).toBe(0);
    expect(separated[1].x).toBe(400);
    expect(separated[1].y).toBe(300);
  });
});
