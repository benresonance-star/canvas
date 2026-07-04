import { describe, expect, it } from 'vitest';
import { createDefaultPercussionKit } from '../../../../packages/sonic-core/src/index.js';
import { createSonicEngine } from '../SonicStudioBridge.js';

describe('SonicStudioBridge', () => {
  it('creates an engine and renders a voice', () => {
    const kit = createDefaultPercussionKit();
    const engine = createSonicEngine({ voices: [kit.kick] });
    const voiceId = engine.createVoice('kick');
    const rendered = engine.renderVoice(voiceId);
    expect(rendered.left.length).toBeGreaterThan(1000);
    expect(engine.hashVoice(voiceId)).toMatch(/^sonic-/);
  });

  it('updates voice params before render', () => {
    const kit = createDefaultPercussionKit();
    const engine = createSonicEngine({ voices: [kit.kick] });
    const voiceId = engine.createVoice('kick');
    engine.updateVoiceParams(voiceId, { output: { gain: 0.2 } });
    const rendered = engine.renderVoice(voiceId);
    expect(rendered.stats.peak).toBeLessThan(1);
  });
});
