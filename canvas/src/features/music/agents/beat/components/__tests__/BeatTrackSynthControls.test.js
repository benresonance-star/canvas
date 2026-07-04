import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BeatTrackSynthControls } from '../BeatTrackSynthControls.jsx';

describe('BeatTrackSynthControls', () => {
  const track = {
    id: 'kick',
    role: 'kick',
    synth: { gain: 1, attackMs: 1, decayMs: 180, pitch: 0, tone: 0.55, distortion: 0.12 },
  };

  it('renders dial controls for the synth block', () => {
    const html = renderToStaticMarkup(
      React.createElement(BeatTrackSynthControls, {
        track,
        variant: 'dials',
        onChange: vi.fn(),
      }),
    );
    expect(html).toContain('Gain');
    expect(html).toContain('Attack');
    expect(html).toContain('Decay');
    expect(html).toContain('Drive');
    expect(html).toContain('stroke="#19d9e6"');
    expect(html).toContain('Pitch');
  });
});
