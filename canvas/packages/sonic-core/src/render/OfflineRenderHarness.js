import { analyzeAudioBlock, createAudioBlock } from '../audio/AudioBlock.js';
import { SeededRandom } from '../dsp/SeededRandom.js';
import { sanitizeSample } from '../dsp/sanitizeSample.js';

export function renderOffline({
  sampleRate = 48000,
  durationSeconds = 1,
  channels = 2,
  blockSize = 128,
  seed = 1,
  renderBlock,
} = {}) {
  const safeSampleRate = Math.max(1, Math.floor(Number(sampleRate) || 48000));
  const totalFrames = Math.max(1, Math.round(safeSampleRate * Math.max(0.001, durationSeconds)));
  const safeChannels = Math.max(1, Math.floor(Number(channels) || 2));
  const safeBlockSize = Math.max(1, Math.floor(Number(blockSize) || 128));
  const output = createAudioBlock({ channels: safeChannels, frames: totalFrames });
  const random = new SeededRandom(seed);
  let frame = 0;
  while (frame < totalFrames) {
    const frames = Math.min(safeBlockSize, totalFrames - frame);
    const block = createAudioBlock({ channels: safeChannels, frames });
    renderBlock?.(block, {
      frame,
      sampleRate: safeSampleRate,
      channels: safeChannels,
      random,
    });
    for (let channelIndex = 0; channelIndex < safeChannels; channelIndex += 1) {
      for (let index = 0; index < frames; index += 1) {
        output[channelIndex][frame + index] = sanitizeSample(block[channelIndex][index]);
      }
    }
    frame += frames;
  }
  return {
    sampleRate: safeSampleRate,
    durationSeconds: totalFrames / safeSampleRate,
    channels: safeChannels,
    frames: totalFrames,
    buffer: output,
    stats: analyzeRenderedBuffer(output),
  };
}

export function analyzeRenderedBuffer(buffer) {
  return analyzeAudioBlock(buffer);
}
