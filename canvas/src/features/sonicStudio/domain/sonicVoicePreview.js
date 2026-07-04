import { renderSonicStudioVoicePreview } from './sonicStudioAudition.js';

export async function getSonicPreviewAudioContext(audioContextRef) {
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('WebAudio is not available in this browser.');
  if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
  return audioContextRef.current;
}

export function stopSonicPreviewSource(activeSourceRef) {
  if (!activeSourceRef?.current) return;
  try {
    activeSourceRef.current.stop();
  } catch {
    /* already stopped */
  }
  activeSourceRef.current = null;
}

function createPreviewBufferSource(context, renderedBuffer) {
  const left = renderedBuffer?.[0] ?? new Float32Array(0);
  const right = renderedBuffer?.[1] ?? left;
  const frames = Math.max(left.length, right.length);
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  buffer.copyToChannel(left, 0, 0);
  buffer.copyToChannel(right, 1, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

export async function playSonicVoicePreview({
  voice,
  engineState = {},
  audioContextRef,
  activeSourceRef,
  seed = Date.now() % 100000,
} = {}) {
  if (!voice) return { ok: false, reason: 'no_voice' };
  const context = await getSonicPreviewAudioContext(audioContextRef);
  stopSonicPreviewSource(activeSourceRef);
  if (context.state === 'suspended') await context.resume();
  const render = renderSonicStudioVoicePreview({
    voice,
    engineState,
    sampleRate: context.sampleRate,
    seed,
  });
  const source = createPreviewBufferSource(context, render.buffer);
  const gain = context.createGain();
  gain.gain.value = 0.9;
  source.connect(gain);
  gain.connect(context.destination);
  await new Promise((resolve, reject) => {
    source.onended = () => {
      if (activeSourceRef.current === source) activeSourceRef.current = null;
      resolve();
    };
    source.onerror = reject;
    activeSourceRef.current = source;
    source.start();
  });
  return { ok: true };
}
