import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PREVIEW_MAX_BYTES_3D_MODEL } from '../../lib/constants.js';
import { CardPreview } from '../CardPreview.jsx';
import { ModalContent } from '../ModalContent.jsx';

vi.mock('../../hooks/useArtifactPayloadText.js', () => ({
  useArtifactPayloadText: () => ({ text: '', loading: false, error: false }),
}));

vi.mock('../../features/threeDArtifact/components/ThreeDModelSummary.jsx', () => ({
  ThreeDModelSummary: () => React.createElement('div', { 'data-testid': 'three-d-summary' }, '3D model summary'),
}));

vi.mock('../../features/threeDArtifact/components/ThreeDSnapshotPreview.jsx', () => ({
  ThreeDSnapshotPreview: () =>
    React.createElement('div', { 'data-testid': 'three-d-snapshot-preview' }, 'Loading preview'),
}));

vi.mock('../../features/threeDArtifact/components/ThreeDArtifactView.jsx', () => ({
  ThreeDInlineViewer: ({ folderLinked, showToolbar }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'three-d-inline',
        'data-folder-linked': String(Boolean(folderLinked)),
        'data-show-toolbar': String(Boolean(showToolbar)),
      },
      'Inline 3D viewer',
    ),
  ThreeDFullViewer: ({ version, folderLinked }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'three-d-full',
        'data-folder-linked': String(Boolean(folderLinked)),
      },
      'Full 3D viewer',
    ),
}));

describe('3D artifact UI routes', () => {
  const card = {
    id: 'model-card',
    type: '3d-model',
    name: 'Chair',
    versions: [],
    pinnedVersion: 1,
  };
  const version = {
    version: 1,
    filename: 'models__chair-v1.glb',
    ext: 'glb',
    objectUrl: 'blob:model',
  };

  it('prepares inactive card previews for cached snapshot display', () => {
    const snapshotVersion = {
      ...version,
      content_hash: 'hash-1',
      threeDSnapshotCacheKey: 'p1:models__chair:v1:3d-snapshot',
      threeDSnapshotContentHash: 'hash-1',
    };
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card,
        pinned: snapshotVersion,
        isActive: false,
      }),
    );
    expect(html).toContain('Loading preview');
  });

  it('lazy-loads active card previews behind the 3D summary fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card,
        pinned: version,
        isActive: true,
      }),
    );
    expect(html).toContain('3D model summary');
  });

  it('lazy-loads modal content behind the 3D summary fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(ModalContent, {
        card,
        version,
      }),
    );
    expect(html).toContain('3D model summary');
  });

  it('keeps oversized active card previews on the summary surface', () => {
    const largeVersion = {
      ...version,
      objectUrl: null,
      previewCacheKey: null,
      size: PREVIEW_MAX_BYTES_3D_MODEL + 1,
      relativePath: 'models/large.glb',
    };
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card,
        pinned: largeVersion,
        isActive: true,
        folderHandle: { name: 'project' },
      }),
    );
    expect(html).toContain('3D model summary');
    expect(html).not.toContain('Inline 3D viewer');
  });

  it('passes folderLinked to the fullscreen viewer route', () => {
    const html = renderToStaticMarkup(
      React.createElement(ModalContent, {
        card,
        version,
        folderHandle: { name: 'project' },
      }),
    );
    expect(html).toContain('data-folder-linked="true"');
  });
});
