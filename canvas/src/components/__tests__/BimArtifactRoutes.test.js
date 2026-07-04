import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardPreview } from '../CardPreview.jsx';
import { ModalContent } from '../ModalContent.jsx';

vi.mock('../../hooks/useArtifactPayloadText.js', () => ({
  useArtifactPayloadText: () => ({ text: '', loading: false, error: false }),
}));

vi.mock('../../features/bim/components/BimModelSummary.jsx', () => ({
  BimModelSummary: () => React.createElement('div', { 'data-testid': 'bim-summary' }, 'BIM model summary'),
}));

vi.mock('../../features/bim/components/BimWorkspace.jsx', () => ({
  BimWorkspace: () => React.createElement('div', { 'data-testid': 'bim-workspace' }, 'BIM workspace'),
}));

describe('BIM artifact UI routes', () => {
  const card = {
    id: 'bim-card',
    type: 'bim-model',
    name: 'Clinic IFC',
    versions: [],
    pinnedVersion: 1,
  };
  const version = {
    version: 1,
    filename: 'models__clinic-v1.ifc',
    ext: 'ifc',
    objectUrl: 'blob:ifc',
    content_hash: 'ifc-hash',
  };

  it('renders a BIM summary on canvas cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card,
        pinned: version,
        isActive: false,
      }),
    );
    expect(html).toContain('BIM model summary');
  });

  it('lazy-loads modal BIM workspace behind the summary fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(ModalContent, {
        card,
        version,
      }),
    );
    expect(html).toContain('BIM model summary');
  });
});
