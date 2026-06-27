import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FlowPreview,
  FLOW_PREVIEW_DEFAULT_NODE_SIZE,
  buildFlowPreviewLabelLines,
  measureFlowPreviewNodeSize,
  wrapLabelWordsOnly,
} from '../FlowPreview.jsx';

describe('FlowPreview', () => {
  it('shows empty exploration copy when there are no nodes', () => {
    const html = renderToStaticMarkup(React.createElement(FlowPreview, { preview: { nodes: [], edges: [] } }));
    expect(html).toContain('Empty exploration');
  });

  it('wrapLabelWordsOnly splits only between words', () => {
    const lines = wrapLabelWordsOnly('alpha beta gamma', 120, 8);
    expect(lines).toEqual(['alpha beta', 'gamma']);
    expect(lines.join(' ')).toBe('alpha beta gamma');
  });

  it('wrapLabelWordsOnly keeps hyphenated filenames on one line', () => {
    const lines = buildFlowPreviewLabelLines({
      type: 'artifact',
      displayFilename: 'customer-onboarding-guide.md',
    }, false);
    expect(lines).toEqual(['customer-onboarding-guide.md']);
  });

  it('buildFlowPreviewLabelLines wraps multi-word labels between words', () => {
    const lines = buildFlowPreviewLabelLines({
      type: 'artifact',
      displayFilename: 'customer onboarding guide',
    }, false);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('customer onboarding guide');
    lines.forEach((line) => {
      expect(line).not.toMatch(/customer-/);
      expect(line).not.toMatch(/onboard$/);
    });
  });

  it('measureFlowPreviewNodeSize keeps short labels at default node size', () => {
    const label = 'agent.ts';
    const lines = buildFlowPreviewLabelLines({
      type: 'artifact',
      displayFilename: label,
    }, false);
    expect(measureFlowPreviewNodeSize(lines, false, label, 'ARTIFACT')).toEqual({
      width: FLOW_PREVIEW_DEFAULT_NODE_SIZE.full.width,
      height: FLOW_PREVIEW_DEFAULT_NODE_SIZE.full.height,
    });
  });

  it('measureFlowPreviewNodeSize grows for long wrapped labels', () => {
    const label = 'segment-one segment-two segment-three segment-four segment-five segment-six';
    const lines = buildFlowPreviewLabelLines({
      type: 'local',
      title: label,
    }, false);
    const size = measureFlowPreviewNodeSize(lines, false, label, 'ARTIFACT');
    expect(lines.length).toBeGreaterThan(3);
    expect(size.height).toBeGreaterThan(FLOW_PREVIEW_DEFAULT_NODE_SIZE.full.height);
  });

  it('renders artifact filenames inside the SVG', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [{
            id: 'n1',
            x: 0,
            y: 0,
            type: 'artifact',
            title: 'agent',
            displayFilename: 'agent.ts',
          }],
          edges: [],
        },
        compact: false,
      }),
    );
    expect(html).toContain('agent.ts');
    expect(html).toContain('ARTIFACT');
    expect(html).toContain('<tspan');
    expect(html).toContain('fill="#2563eb"');
    expect(html).toContain('width="180"');
    expect(html).toContain('height="88"');
  });

  it('resolves artifact extension from linked card when preview lacks displayFilename', () => {
    const cardsById = new Map([['card-1', {
      id: 'card-1',
      name: 'Instructions',
      type: 'markdown',
      versions: [{ version: 1, ext: 'md' }],
      pinnedVersion: 1,
    }]]);
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [{
            id: 'n1',
            x: 0,
            y: 0,
            type: 'artifact',
            title: 'Instructions',
            cardId: 'card-1',
          }],
          edges: [],
        },
        compact: false,
        cardsById,
      }),
    );
    expect(html).toContain('Instructions.md');
  });

  it('renders decision nodes with custom header color and type label', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          localNodeTypeColors: { decision: '#059669' },
          nodes: [{
            id: 'n1',
            x: 0,
            y: 0,
            type: 'local',
            localNodeType: 'decision',
            title: 'Approve scope',
          }],
          edges: [],
        },
        compact: false,
      }),
    );
    expect(html).toContain('DECISION');
    expect(html).toContain('Approve');
    expect(html).toContain('scope');
    expect(html).toContain('fill="#059669"');
  });

  it('marks flowing edges with animated preview class', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [
            { id: 'n1', x: 0, y: 0, type: 'local', title: 'Start' },
            { id: 'n2', x: 260, y: 40, type: 'local', title: 'End' },
          ],
          edges: [{ source: 'n1', target: 'n2', flowing: true }],
        },
        compact: false,
      }),
    );
    expect(html).toContain('flow-preview-edge--animated');
    expect(html).toContain('marker-end="url(#flow-preview-arrow)"');
  });

  it('marks reversed flowing edges with reverse class and marker-start', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [
            { id: 'n1', x: 0, y: 0, type: 'local', title: 'Start' },
            { id: 'n2', x: 260, y: 40, type: 'local', title: 'End' },
          ],
          edges: [{ source: 'n1', target: 'n2', flowing: true, direction: 'reverse' }],
        },
        compact: false,
      }),
    );
    expect(html).toContain('flow-preview-edge--reverse');
    expect(html).toContain('marker-start="url(#flow-preview-arrow)"');
  });

  it('renders smoothstep edge paths instead of straight lines', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [
            { id: 'n1', x: 0, y: 0, type: 'local', title: 'Start' },
            { id: 'n2', x: 260, y: 40, type: 'artifact', title: 'agent.ts', displayFilename: 'agent.ts' },
          ],
          edges: [{ source: 'n1', target: 'n2' }],
        },
        compact: false,
      }),
    );
    expect(html).toContain('<path');
    expect(html).not.toContain('<line');
    expect(html).toMatch(/d="M[^"]+L[^"]+"/);
  });

  it('separates overlapping nodes in rendered preview', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowPreview, {
        preview: {
          nodes: [
            { id: 'n1', x: 754, y: 256, type: 'artifact', title: 'skills-grilling.md', displayFilename: 'skills-grilling.md' },
            { id: 'n2', x: 1050, y: 318, type: 'artifact', title: 'tools-python.ts', displayFilename: 'tools-python.ts' },
          ],
          edges: [{ source: 'n1', target: 'n2' }],
        },
        compact: false,
      }),
    );
    const firstTransform = html.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    const transforms = [...html.matchAll(/translate\(([-\d.]+) ([-\d.]+)\)/g)];
    expect(transforms.length).toBeGreaterThanOrEqual(2);
    const yValues = transforms.map((match) => Number(match[2]));
    expect(Math.abs(yValues[0] - yValues[1])).toBeGreaterThan(50);
    expect(firstTransform).toBeTruthy();
  });
});
