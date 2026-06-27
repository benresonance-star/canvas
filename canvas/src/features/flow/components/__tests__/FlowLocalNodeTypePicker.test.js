import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlowLocalNodeTypePicker } from '../FlowLocalNodeTypePicker.jsx';

vi.mock('../FlowLocalNodeTypeMenu.jsx', () => ({
  FlowLocalNodeTypeMenu: ({ onSelect }) => (
    React.createElement('button', {
      type: 'button',
      'data-testid': 'pick-agent',
      onClick: () => onSelect('agent'),
    }, 'Agent')
  ),
}));

describe('FlowLocalNodeTypePicker', () => {
  it('renders a primary add button and a separate type menu toggle', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowLocalNodeTypePicker, { onSelectType: vi.fn() }),
    );
    expect(html).toContain('New step');
    expect(html.match(/type="button"/g)?.length).toBe(2);
    expect(html).toContain('aria-label="Choose step type"');
  });
});
