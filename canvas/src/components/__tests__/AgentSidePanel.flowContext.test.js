import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AgentSidePanel } from '../AgentSidePanel.jsx';
import { strings } from '../../content/strings.js';

describe('AgentSidePanel flow context', () => {
  it('renders removable exploration step context rows', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentSidePanel, {
        panelMode: 'single',
        singleConnectorId: 'openai',
        enabledAgentIds: new Set(),
        contextScope: 'flow',
        contextCards: [],
        selectedCardIds: new Set(),
        flowSelectionSummary: { isFullFlow: false, nodeCount: 1, edgeCount: 0 },
        flowContextSteps: [
          {
            id: 'step-1',
            title: 'Specification review',
            typeLabel: 'Evaluation',
            kind: 'local',
          },
        ],
        onRemoveFlowContextStep: vi.fn(),
      }),
    );

    expect(html).toContain(strings.agent.contextFlowStepsHeading);
    expect(html).toContain('Specification review');
    expect(html).toContain(strings.agent.contextRemoveStep);
  });
});
