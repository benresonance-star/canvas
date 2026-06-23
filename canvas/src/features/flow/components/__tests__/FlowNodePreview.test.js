import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlowEditorProvider } from '../FlowEditorContext.jsx';
import { FlowNodePreview } from '../FlowNodePreview.jsx';

vi.mock('../../../../components/CardPreview.jsx', () => ({
  CardPreview: ({ isActive }) => React.createElement('div', { 'data-is-active': String(isActive) }),
}));

vi.mock('../../../../components/NotePreviewFrame.jsx', () => ({
  NotePreviewFrame: ({ isActive }) => React.createElement('div', { 'data-is-active': String(isActive) }),
}));

vi.mock('../../hooks/useFlowAgentChatPreviewContext.js', () => ({
  useFlowAgentChatPreviewContext: () => ({ index: null, connectorId: null }),
}));

const markdownCard = {
  id: 'card-1',
  name: 'Instructions.md',
  type: 'markdown',
  pinnedVersion: 1,
  versions: [{ version: 1, content: '# Hello' }],
};

const editorContext = {
  cardsById: new Map([[markdownCard.id, markdownCard]]),
  folderHandle: null,
  projectId: 'project-1',
  onRehydratePreview: null,
  updateNode: vi.fn(),
  checkpoint: vi.fn(),
  agentScopedNodeIds: null,
};

function renderPreview(props) {
  return renderToStaticMarkup(
    React.createElement(
      FlowEditorProvider,
      { value: editorContext },
      React.createElement(FlowNodePreview, props),
    ),
  );
}

describe('FlowNodePreview', () => {
  it('applies horizontal padding on artifact preview wrapper', () => {
    const html = renderPreview({
      nodeType: 'artifact',
      data: { cardId: markdownCard.id },
      selected: false,
    });
    expect(html).toContain('px-4');
    expect(html).toContain('pb-2');
    expect(html).not.toContain('nowheel');
    expect(html).not.toContain('nodrag');
  });

  it('passes isActive=false to CardPreview when not selected', () => {
    const html = renderPreview({
      nodeType: 'artifact',
      data: { cardId: markdownCard.id },
      selected: false,
    });
    expect(html).toContain('data-is-active="false"');
  });

  it('adds nowheel nodrag and isActive when selected', () => {
    const html = renderPreview({
      nodeType: 'artifact',
      data: { cardId: markdownCard.id },
      selected: true,
    });
    expect(html).toContain('nowheel');
    expect(html).toContain('nodrag');
    expect(html).toContain('data-is-active="true"');
  });

  it('applies scroll classes and isActive for local node previews', () => {
    const html = renderPreview({
      nodeType: 'local',
      data: { title: 'Step', description: 'Do the thing.' },
      selected: true,
    });
    expect(html).toContain('px-4');
    expect(html).toContain('nowheel');
    expect(html).toContain('data-is-active="true"');
  });
});
