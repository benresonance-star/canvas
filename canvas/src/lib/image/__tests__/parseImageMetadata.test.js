import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import {
  buildImageArtifactMetadata,
  parseImageMetadata,
  resolveGeneratedImageProvenance,
  resolveImageMetadata,
} from '../imageArtifactMetadata.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makeTestPng({ width = 4, height = 3, bitDepth = 8, colorType = 2 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  const rows = [];
  const bytesPerPixel = colorType === 2 ? 3 : 1;
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * bytesPerPixel);
    row[0] = 0;
    rows.push(row);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('parseImageMetadata', () => {
  it('parses PNG IHDR dimensions and bit depth', () => {
    const bytes = makeTestPng({ width: 640, height: 360, bitDepth: 8, colorType: 2 });
    const meta = parseImageMetadata(bytes, { mimeType: 'image/png', ext: 'png' });
    expect(meta).toMatchObject({
      mimeType: 'image/png',
      ext: 'png',
      width: 640,
      height: 360,
      bitDepth: 8,
      colorType: 'rgb',
      fileSizeBytes: bytes.length,
    });
  });

  it('buildImageArtifactMetadata falls back to provided dimensions', () => {
    const meta = buildImageArtifactMetadata(Buffer.from('not-an-image'), {
      mimeType: 'image/jpeg',
      ext: 'jpg',
      width: 1024,
      height: 1536,
    });
    expect(meta).toMatchObject({
      mimeType: 'image/jpeg',
      ext: 'jpg',
      width: 1024,
      height: 1536,
      bitDepth: 8,
    });
  });

  it('resolveImageMetadata merges legacy artifact width/height with version imageMetadata', () => {
    const resolved = resolveImageMetadata(
      {
        canvas_kind: 'generated_image',
        width: 640,
        height: 360,
        filename: 'generated__abc.png',
      },
      {
        imageMetadata: {
          mimeType: 'image/png',
          ext: 'png',
          fileSizeBytes: 12000,
          width: 640,
          height: 360,
          bitDepth: 8,
        },
      },
    );
    expect(resolved).toMatchObject({
      mimeType: 'image/png',
      width: 640,
      height: 360,
      fileSizeBytes: 12000,
    });
  });

  it('resolveImageMetadata reads root-level dimensions when image block is missing', () => {
    const resolved = resolveImageMetadata({
      canvas_kind: 'generated_image',
      width: 512,
      height: 512,
      mimeType: 'image/png',
      ext: 'png',
    });
    expect(resolved).toMatchObject({
      width: 512,
      height: 512,
      mimeType: 'image/png',
    });
  });

  it('resolveImageMetadata falls back to generatedMetadata on the card version', () => {
    const resolved = resolveImageMetadata(null, {
      generatedMetadata: {
        width: 1536,
        height: 1024,
        image: {
          mimeType: 'image/png',
          ext: 'png',
          bitDepth: 8,
        },
      },
      size: 45000,
    });
    expect(resolved).toMatchObject({
      width: 1536,
      height: 1024,
      mimeType: 'image/png',
      fileSizeBytes: 45000,
    });
  });

  it('resolveGeneratedImageProvenance merges artifact metadata with card version metadata', () => {
    expect(resolveGeneratedImageProvenance(
      { provider: 'gemini', model: 'gemini-3.1-flash-image' },
      { generatedMetadata: { originalPromptSnapshot: 'Night scene' } },
    )).toEqual({
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
    });
    expect(resolveGeneratedImageProvenance(
      null,
      { generatedMetadata: { provider: 'openai', model: 'gpt-image-1' } },
    )).toEqual({
      provider: 'openai',
      model: 'gpt-image-1',
    });
  });
});
