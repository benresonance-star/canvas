import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TreeNodeRow, WorkspaceTreePanel } from '../WorkspaceTreePanel.jsx';
import { strings } from '../../content/strings.js';

describe('WorkspaceTreePanel', () => {
  it('renders the project/all-projects view toggle', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceTreePanel, {
        clusterId: 'cluster-1',
        projectName: 'Project One',
        onClose: () => {},
      }),
    );

    expect(html).toContain(strings.workspaceTree.projectView);
    expect(html).toContain(strings.workspaceTree.allProjectsView);
    expect(html).toContain(`aria-label="${strings.workspaceTree.viewModeLabel}"`);
  });

  it('renders only active canvas and dock refs from project primitive rows', () => {
    const activeCard = {
      id: 'card-1',
      type: 'pdf',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { type: 'artifact', id: 'art-active' } }],
    };
    const dockCard = {
      id: 'dock-1',
      type: 'pdf',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { type: 'artifact', id: 'art-dock' } }],
    };
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceTreePanel, {
        clusterId: 'cluster-1',
        projectName: 'Project One',
        cards: [activeCard],
        stagedSyncCards: [dockCard],
        onClose: () => {},
      }),
    );

    expect(html).toContain(strings.workspaceTree.projectView);
    expect(html).toContain(strings.workspaceTree.allProjectsView);
  });

  it('marks the selected primitive leaf as current', () => {
    const html = renderToStaticMarkup(
      React.createElement(TreeNodeRow, {
        node: {
          id: 'artifact-art-active',
          kind: 'leaf',
          label: 'Active artifact',
          primitiveRef: { type: 'artifact', id: 'art-active' },
          children: [],
        },
        depth: 0,
        expanded: new Set(),
        onToggle: () => {},
        onSelectLeaf: () => {},
        selectedPrimitiveKey: 'artifact:art-active',
      }),
    );

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('ring-primary/40');
  });

  it('keeps single-click selection separate from double-click zoom', () => {
    const onSelectLeaf = vi.fn();
    const onDoubleClickLeaf = vi.fn();
    const primitiveRef = { type: 'artifact', id: 'art-active' };

    const element = TreeNodeRow({
      node: {
        id: 'artifact-art-active',
        kind: 'leaf',
        label: 'Active artifact',
        primitiveRef,
        children: [],
      },
      depth: 0,
      expanded: new Set(),
      onToggle: () => {},
      onSelectLeaf,
      onDoubleClickLeaf,
      selectedPrimitiveKey: '',
    });

    element.props.onClick();
    expect(onSelectLeaf).toHaveBeenCalledWith(primitiveRef);
    expect(onDoubleClickLeaf).not.toHaveBeenCalled();

    element.props.onDoubleClick();
    expect(onDoubleClickLeaf).toHaveBeenCalledWith(primitiveRef);
  });

  it('routes cluster leaf double-clicks through the zoom callback', () => {
    const onDoubleClickLeaf = vi.fn();
    const primitiveRef = { type: 'cluster', id: 'cluster-active' };

    const element = TreeNodeRow({
      node: {
        id: 'cluster-cluster-active',
        kind: 'leaf',
        label: 'Active cluster',
        primitiveRef,
        children: [],
      },
      depth: 0,
      expanded: new Set(),
      onToggle: () => {},
      onSelectLeaf: () => {},
      onDoubleClickLeaf,
      selectedPrimitiveKey: '',
    });

    element.props.onDoubleClick();
    expect(onDoubleClickLeaf).toHaveBeenCalledWith(primitiveRef);
  });
});
