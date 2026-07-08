/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import * as THREE from 'three';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');

    constructor() {}

    setPixelRatio() {}

    setSize() {}

    setClearColor() {}

    render() {}

    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

import { BimViewNavigatorGimbal, VIEW_NAVIGATOR_PRESETS } from '../BimViewNavigatorGimbal.jsx';

function renderGimbal(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(BimViewNavigatorGimbal, {
        getCameraQuaternion: () => new THREE.Quaternion(),
        onApplyPreset: () => {},
        ...props,
      }),
    );
  });
  return { container, root };
}

describe('BimViewNavigatorGimbal', () => {
  it('renders the gimbal landmark and canvas in static markup', () => {
    const html = renderToStaticMarkup(
      React.createElement(BimViewNavigatorGimbal, {
        getCameraQuaternion: () => new THREE.Quaternion(),
        onApplyPreset: () => {},
      }),
    );
    expect(html).toContain('aria-label="View navigator gimbal"');
    expect(html).toContain('Right-click for view presets');
    expect(html).toContain('<canvas');
    expect(html).not.toContain('border-border/60');
  });

  it('exports all preset labels', () => {
    expect(VIEW_NAVIGATOR_PRESETS.map((entry) => entry.label)).toEqual([
      'Home',
      'Top',
      'Bottom',
    ]);
  });

  it('opens a right-click preset menu with all view options', () => {
    const { container } = renderGimbal();
    const gimbal = container.querySelector('[aria-label="View navigator gimbal"]');
    act(() => {
      gimbal.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const menu = document.body.querySelector('[aria-label="View presets"]');
    expect(menu).not.toBeNull();
    expect(menu.className).toContain('pointer-events-auto');
    for (const preset of VIEW_NAVIGATOR_PRESETS) {
      expect(menu.textContent).toContain(preset.label);
    }
    const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    expect(menuItems).toHaveLength(VIEW_NAVIGATOR_PRESETS.length);
  });
});
