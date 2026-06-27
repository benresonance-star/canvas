import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlowEditorProvider } from '../FlowEditorContext.jsx';
import { FlowNodePreview } from '../FlowNodePreview.jsx';

vi.mock('../../../../components/CardPreview.jsx', () => ({
  CardPreview: ({ isActive }) => React.createElement('div', { 'data-is-active': String(isActive) }),
}));

vi.mock('../../../../components/NotePreviewFrame.jsx', () => ({
  NotePreviewFrame: ({ isActive }) => React.createElement('div', { 'data-note-preview': String(isActive) }),
}));

vi.mock('../../../../components/EditableMarkdownMessage.jsx', () => ({
  EditableMarkdownMessage: ({ value }) => React.createElement('div', { 'data-editable-markdown': value ?? '' }),
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
  readOnly: false,
  localNodeTypeColors: {},
  setLocalNodeTypeColor: vi.fn(),
  pathRunStateByStepId: new Map(),
};

function renderPreview(props, context = editorContext) {
  return renderToStaticMarkup(
    React.createElement(
      FlowEditorProvider,
      { value: context },
      React.createElement(FlowNodePreview, {
        nodeId: 'node-1',
        ...props,
      }),
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

  it('uses read-only note preview for unselected local nodes', () => {
    const html = renderPreview({
      nodeType: 'local',
      data: { title: 'Step', description: 'Do the thing.' },
      selected: false,
    });
    expect(html).toContain('data-note-preview="false"');
    expect(html).toContain('px-2 pt-1 pb-1');
    expect(html).not.toContain('data-editable-markdown');
  });

  it('uses editable markdown for selected local nodes', () => {
    const html = renderPreview({
      nodeType: 'local',
      data: { title: 'Step', description: 'Do the thing.' },
      selected: true,
    });
    expect(html).toContain('nowheel');
    expect(html).toContain('px-2 pt-1 pb-1');
    expect(html).toContain('data-editable-markdown="Do the thing."');
    expect(html).not.toContain('data-note-preview');
  });

  it('keeps local preview read-only when readOnly is true', () => {
    const html = renderPreview(
      {
        nodeType: 'local',
        data: { title: 'Step', description: 'Do the thing.' },
        selected: true,
      },
      { ...editorContext, readOnly: true },
    );
    expect(html).toContain('data-note-preview="true"');
    expect(html).not.toContain('data-editable-markdown');
  });
});
