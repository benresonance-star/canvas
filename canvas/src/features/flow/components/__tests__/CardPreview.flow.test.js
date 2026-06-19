import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardPreview } from '../../../../components/CardPreview.jsx';

vi.mock('../../../../hooks/useArtifactPayloadText.js', () => ({
  useArtifactPayloadText: () => ({ text: '', loading: false, error: null }),
}));

vi.mock('../../../../hooks/useAgentChatCardMessages.js', () => ({
  useAgentChatCardMessages: () => ({ loading: false, messages: [], error: null }),
}));

const flowCard = {
  id: 'flow-card-1',
  name: 'Onboarding',
  type: 'flow',
  versions: [{ version: 1 }],
  pinnedVersion: 1,
};

const flowPinned = {
  version: 1,
  flowPreview: {
    description: 'Walk new users through setup',
    nodes: [{ id: 'n1', x: 0, y: 0, type: 'local', title: 'Start' }],
    edges: [],
  },
};

describe('CardPreview flow branch', () => {
  it('shows description when not compact', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card: flowCard,
        pinned: flowPinned,
        isActive: false,
        compact: false,
      }),
    );
    expect(html).toContain('Walk new users through setup');
    expect(html).toContain('Start');
  });

  it('hides description when compact', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card: flowCard,
        pinned: flowPinned,
        isActive: false,
        compact: true,
      }),
    );
    expect(html).not.toContain('Walk new users through setup');
    expect(html).toContain('Start');
  });

  it('shows artifact extensions in flow preview when cardsById is provided', () => {
    const cardsById = new Map([['artifact-card', {
      id: 'artifact-card',
      name: 'agent',
      type: 'code',
      versions: [{ version: 1, ext: 'ts' }],
      pinnedVersion: 1,
    }]]);
    const html = renderToStaticMarkup(
      React.createElement(CardPreview, {
        card: flowCard,
        pinned: {
          version: 1,
          flowPreview: {
            nodes: [{
              id: 'n1',
              x: 0,
              y: 0,
              type: 'artifact',
              title: 'agent',
              cardId: 'artifact-card',
            }],
            edges: [],
          },
        },
        isActive: false,
        compact: false,
        cardsById,
      }),
    );
    expect(html).toContain('agent.ts');
  });
});
