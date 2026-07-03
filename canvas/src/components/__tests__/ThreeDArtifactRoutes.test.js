import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardPreview } from '../CardPreview.jsx';
import { ModalContent } from '../ModalContent.jsx';

vi.mock('../../hooks/useArtifactPayloadText.js', () => ({
  useArtifactPayloadText: () => ({ text: '', loading: false, error: false }),
}));

vi.mock('../../features/threeDArtifact/components/ThreeDModelSummary.jsx', () => ({
  ThreeDModelSummary: () => React.createElement('div', { 'data-testid': 'three-d-summary' }, '3D model summary'),
}));

vi.mock('../../features/threeDArtifact/components/ThreeDArtifactView.jsx', () => ({
  ThreeDInlineViewer: () => React.createElement('div', { 'data-testid': 'three-d-inline' }, 'Inline 3D viewer'),
  ThreeDFullViewer: () => React.createElement('div', { 'data-testid': 'three-d-full' }, 'Full 3D viewer'),
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

  it('routes inactive card previews to the summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card,
        pinned: version,
        isActive: false,
      }),
    );
    expect(html).toContain('3D model summary');
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
});
