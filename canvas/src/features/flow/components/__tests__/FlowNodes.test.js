import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowEditorProvider } from '../FlowEditorContext.jsx';
import { LocalFlowNode } from '../FlowNodes.jsx';

vi.mock('../FlowNodePreview.jsx', () => ({
  FlowNodePreview: () => React.createElement('div', { 'data-testid': 'flow-node-preview' }),
}));

const baseContext = {
  cardsById: new Map(),
  folderHandle: null,
  projectId: 'project-1',
  onRehydratePreview: null,
  updateNode: vi.fn(),
  checkpoint: vi.fn(),
  agentScopedNodeIds: null,
  readOnly: false,
  localNodeTypeColors: { step: '#4a5568', artifact: '#2563eb' },
  setLocalNodeTypeColor: vi.fn(),
};

function renderLocalNode(props, context = baseContext) {
  return renderToStaticMarkup(
    React.createElement(
      ReactFlowProvider,
      null,
      React.createElement(
        FlowEditorProvider,
        { value: context },
        React.createElement(LocalFlowNode, {
          id: 'node-1',
          data: { title: 'Review spec', description: 'Check the draft.', localNodeType: 'step' },
          selected: false,
          ...props,
        }),
      ),
    ),
  );
}

describe('LocalFlowNode', () => {
  it('renders static title when not selected', () => {
    const html = renderLocalNode({ selected: false });
    expect(html).toContain('Review spec');
    expect(html).not.toContain('<input');
  });

  it('renders inline title input when selected and editable', () => {
    const html = renderLocalNode({ selected: true });
    expect(html).toContain('<input');
    expect(html).toContain('value="Review spec"');
    expect(html).toContain('nodrag');
  });

  it('suppresses inline title input when readOnly', () => {
    const html = renderLocalNode(
      { selected: true },
      { ...baseContext, readOnly: true },
    );
    expect(html).toContain('Review spec');
    expect(html).not.toContain('<input');
  });

  it('uses the local node type header color', () => {
    const html = renderLocalNode({
      data: { title: 'Agent step', localNodeType: 'step' },
    });
    expect(html).toContain('background-color:#4a5568');
  });

  it('migrates legacy local node types to artifact styling', () => {
    const html = renderLocalNode({
      data: { title: 'Legacy agent node', localNodeType: 'agent' },
    });
    expect(html).toContain('background-color:#2563eb');
  });

  it('renders actor icons in the header when actors are set', () => {
    const html = renderLocalNode({
      data: { title: 'Review', localNodeType: 'step', actors: ['human', 'agent'] },
    });
    expect(html).toContain('aria-label="Node actors"');
    expect(html.match(/lucide-user-round/g)?.length).toBeGreaterThan(0);
    expect(html.match(/lucide-bot/g)?.length).toBeGreaterThan(0);
  });
});
