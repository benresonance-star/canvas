import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fetchOpenAI } from '../lib/openaiFetch.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const OPENAI_IMAGES_GENERATE_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGES_EDIT_URL = 'https://api.openai.com/v1/images/edits';

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

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng({ width, height, seed }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = 1 + x * 3;
      row[i] = (x * 3 + seed * 17) % 256;
      row[i + 1] = (y * 2 + seed * 29) % 256;
      row[i + 2] = ((x + y) + seed * 43) % 256;
    }
    rows.push(row);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sizeForAspectRatio(aspectRatio = '1:1') {
  if (aspectRatio === '16:9') return { width: 640, height: 360 };
  if (aspectRatio === '9:16') return { width: 360, height: 640 };
  if (aspectRatio === '4:3') return { width: 560, height: 420 };
  return { width: 512, height: 512 };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeOutputFormat(format = 'png') {
  if (format === 'jpg') return 'jpeg';
  if (format === 'jpeg') return 'jpeg';
  if (format === 'webp') return 'webp';
  return 'png';
}

function extForOutputFormat(format = 'png') {
  return format === 'jpeg' ? 'jpg' : format;
}

function mimeForOutputFormat(format = 'png') {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function openAiQuality(quality = 'standard') {
  if (quality === 'draft') return 'low';
  if (quality === 'high') return 'high';
  return 'medium';
}

function openAiSize(aspectRatio = '1:1') {
  if (aspectRatio === '9:16') return '1024x1536';
  if (aspectRatio === '16:9') return '1536x1024';
  return '1024x1024';
}

function imageBytesFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function artifactDataUrl(artifact) {
  if (typeof artifact?.payload_text === 'string' && artifact.payload_text.startsWith('data:image/')) {
    return artifact.payload_text;
  }
  if (typeof artifact?.metadata?.dataUrl === 'string' && artifact.metadata.dataUrl.startsWith('data:image/')) {
    return artifact.metadata.dataUrl;
  }
  return null;
}

async function parseOpenAiImageResponse(res, fallbackModel) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `OpenAI image request failed (${res.status})`;
    throw new Error(msg);
  }
  const items = Array.isArray(data.data) ? data.data : [];
  if (!items.length) {
    throw new Error('OpenAI returned no generated images.');
  }
  return {
    model: data.model || fallbackModel,
    usage: data.usage ?? null,
    images: items.map((item, index) => {
      if (!item.b64_json) {
        throw new Error('OpenAI image response did not include b64_json image data.');
      }
      const bytes = Buffer.from(item.b64_json, 'base64');
      return {
        version: index + 1,
        mimeType: null,
        ext: null,
        contentHash: sha256(bytes),
        bytes,
      };
    }),
  };
}

async function runOpenAiImageTransformer(request) {
  const apiKey = request.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const settings = request.settings ?? {};
  const model = request.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const outputFormat = normalizeOutputFormat(settings.outputFormat);
  const imageCount = Math.max(1, Math.min(Number(settings.imageCount) || 1, 4));
  const common = {
    model,
    prompt: request.prompt,
    size: openAiSize(settings.aspectRatio),
    quality: openAiQuality(settings.quality),
    output_format: outputFormat,
  };

  const referenceImages = (request.references ?? [])
    .map((artifact) => {
      const dataUrl = artifactDataUrl(artifact);
      const parsed = imageBytesFromDataUrl(dataUrl);
      return parsed ? { artifact, ...parsed } : null;
    })
    .filter(Boolean);

  if ((request.references?.length ?? 0) > 0 && referenceImages.length === 0) {
    throw new Error('Connected reference images are not available to the server yet. Use an inline image artifact or run with the local placeholder provider.');
  }

  let parsed;
  if (referenceImages.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(common)) {
      form.set(key, value);
    }
    form.set('n', String(imageCount));
    referenceImages.forEach((reference, index) => {
      const ext = reference.mimeType.split('/')[1] || 'png';
      const blob = new Blob([reference.bytes], { type: reference.mimeType });
      form.append('image', blob, `reference-${index + 1}.${ext}`);
    });
    const res = await fetchOpenAI(OPENAI_IMAGES_EDIT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      timeoutMs: 180_000,
    });
    parsed = await parseOpenAiImageResponse(res, model);
  } else {
    const res = await fetchOpenAI(OPENAI_IMAGES_GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...common, n: imageCount }),
      timeoutMs: 180_000,
    });
    parsed = await parseOpenAiImageResponse(res, model);
  }

  const ext = extForOutputFormat(outputFormat);
  const mimeType = mimeForOutputFormat(outputFormat);
  return {
    provider: 'openai',
    model: parsed.model,
    usage: parsed.usage,
    images: parsed.images.map((image) => ({
      version: image.version,
      mimeType,
      ext,
      contentHash: image.contentHash,
      dataUrl: `data:${mimeType};base64,${image.bytes.toString('base64')}`,
    })),
  };
}

export function createAgentPrompt({ prompt, instructions, goal }) {
  return [
    goal ? `Goal: ${goal}` : '',
    instructions ? `Instructions: ${instructions}` : '',
    'Prompt:',
    prompt,
  ].filter(Boolean).join('\n\n');
}

export async function runImageTransformer(request) {
  if (request.provider === 'openai') {
    return runOpenAiImageTransformer(request);
  }

  const settings = request.settings ?? {};
  const imageCount = Math.max(1, Math.min(Number(settings.imageCount) || 1, 8));
  const { width, height } = sizeForAspectRatio(settings.aspectRatio);
  const images = [];
  for (let i = 0; i < imageCount; i += 1) {
    const seed = Number(settings.seed ?? 0) + i + request.prompt.length;
    const bytes = makePng({ width, height, seed });
    images.push({
      version: i + 1,
      width,
      height,
      mimeType: 'image/png',
      ext: 'png',
      contentHash: sha256(bytes),
      dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    });
  }
  return {
    provider: request.provider || 'local',
    model: request.model || 'placeholder-png',
    images,
  };
}
