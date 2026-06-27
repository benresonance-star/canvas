import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModalContent } from '../ModalContent.jsx';

const mockArtifactPayload = {
  text: '{"enabled": true}',
  loading: false,
  error: false,
};

vi.mock('../../hooks/useArtifactPayloadText.js', () => ({
  useArtifactPayloadText: () => mockArtifactPayload,
}));

describe('ModalContent code previews', () => {
  it('renders DB payload text for slimmed JSON code cards before showing inline-size fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(ModalContent, {
        card: {
          id: 'card-json',
          type: 'code',
          name: 'current.pattern',
        },
        version: {
          version: 1,
          filename: 'current.pattern.json',
          ext: 'json',
          inline: false,
          content: null,
          artifactRef: { id: 'artifact-json', type: 'artifact' },
          size: 512,
        },
      }),
    );

    expect(html).toContain('enabled');
    expect(html).not.toContain('File too large to preview inline');
  });
});
