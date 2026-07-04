import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BeatAgentPreview } from '../BeatAgentPreview.jsx';

vi.mock('../../hooks/useBeatAgentRuntime.js', () => ({
  useBeatAgentRuntime: () => ({
    state: {
      status: 'draft',
      pattern: {
        name: 'Default Beat',
        stepCount: 16,
        tracks: [{
          id: 'kick',
          name: 'Kick',
          role: 'kick',
          soundSource: 'sonic_voice',
          sonicVoice: {
            id: 'kick-voice',
            archetype: 'kick',
            material: { brightness: 0.4, hardness: 0.3 },
            body: { resonance: 0.5, damping: 0.4 },
            contact: { friction: 0.2 },
            output: { gain: 0.9, pitchSemitones: 0 },
          },
          steps: Array.from({ length: 16 }, () => ({ active: false })),
          synth: { gain: 1.5, decayMs: 180, tone: 0.55, distortion: 0.12 },
        }],
      },
    },
    transportState: { isPlaying: false, currentTick: 0 },
    play: vi.fn(),
    prepareBeatAudio: vi.fn(),
    enableBeatAudio: vi.fn(),
    audioContextState: 'running',
    stop: vi.fn(),
    playhead: 0,
    toggleStep: vi.fn(),
    updateTrackSynth: vi.fn(),
    updateTrackSound: vi.fn(),
    clockSync: true,
    toggleClockSync: vi.fn(),
    isolatedTrackId: null,
    toggleTrackIsolate: vi.fn(),
    saving: false,
    error: '',
    status: '',
  }),
}));

describe('BeatAgentPreview', () => {
  it('renders Sonic Studio controls when the selected track uses a sonic voice', () => {
    const html = renderToStaticMarkup(
      React.createElement(BeatAgentPreview, {
        card: { id: 'beat-1', name: 'Beat Agent.musicartifact', type: 'music-agent' },
        cards: [],
      }),
    );

    expect(html).toContain('Kick sound');
    expect(html).toContain('Brightness');
    expect(html).toContain('embedded');
    expect(html).toContain('Synth');
    expect(html).toContain('Gain');
    expect(html).toContain('Attack');
  });
});
