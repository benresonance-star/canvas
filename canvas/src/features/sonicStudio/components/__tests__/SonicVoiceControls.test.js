import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SonicVoiceControls } from '../SonicVoiceControls.jsx';

vi.mock('../../domain/sonicVoicePreview.js', () => ({
  playSonicVoicePreview: vi.fn(async () => ({ ok: true })),
  stopSonicPreviewSource: vi.fn(),
}));

describe('SonicVoiceControls', () => {
  const voice = {
    id: 'kick-voice',
    archetype: 'kick',
    material: { brightness: 0.4, hardness: 0.3 },
    body: { resonance: 0.5, damping: 0.4 },
    contact: { friction: 0.2 },
    output: { gain: 0.9 },
  };

  it('renders compact sonic sliders', () => {
    const html = renderToStaticMarkup(
      React.createElement(SonicVoiceControls, {
        voice,
        onChange: () => {},
      }),
    );
    expect(html).toContain('Brightness');
    expect(html).toContain('Hardness');
    expect(html).toContain('Resonance');
    expect(html).toContain('Pitch');
    expect(html).toContain('Semitone steps');
    expect(html).toContain('Preview');
  });

  it('supports compact card layout without preview controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(SonicVoiceControls, {
        voice,
        compact: true,
        showPreview: false,
        onChange: () => {},
      }),
    );
    expect(html).toContain('Brightness');
    expect(html).not.toContain('Preview');
  });

  it('returns null when voice is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(SonicVoiceControls, {
        voice: null,
        onChange: () => {},
      }),
    );
    expect(html).toBe('');
  });
});
