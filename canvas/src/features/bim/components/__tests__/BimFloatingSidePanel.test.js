import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BimFloatingSidePanel } from '../BimFloatingSidePanel.jsx';

describe('BimFloatingSidePanel', () => {
  it('renders a floating left panel with a resize handle on the inner edge', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimFloatingSidePanel, {
        side: 'left',
        width: 320,
        ariaLabel: 'Resize element list panel',
        onResizePointerDown: () => {},
      }, 'Panel body'),
    );
    expect(html).toContain('left-3');
    expect(html).toContain('top-14');
    expect(html).toContain('Resize element list panel');
    expect(html).toContain('Panel body');
  });

  it('renders a floating right panel with a resize handle on the inner edge', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimFloatingSidePanel, {
        side: 'right',
        width: 360,
        ariaLabel: 'Resize inspector panel',
        onResizePointerDown: () => {},
      }, 'Inspector body'),
    );
    expect(html).toContain('right-3');
    expect(html).toContain('Resize inspector panel');
    expect(html).toContain('Inspector body');
  });
});
