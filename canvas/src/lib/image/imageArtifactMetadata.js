const PNG_COLOR_TYPES = {
  0: 'grayscale',
  2: 'rgb',
  3: 'indexed',
  4: 'grayscale-alpha',
  6: 'rgba',
};

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return new Uint8Array(bytes);
}

function readUint32BE(view, offset) {
  return view.getUint32(offset, false);
}

function parsePngMetadata(bytes, { mimeType, ext, fileSizeBytes }) {
  const data = toUint8Array(bytes);
  if (data.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (data[i] !== signature[i]) return null;
  }
  const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
  if (chunkType !== 'IHDR') return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = readUint32BE(view, 16);
  const height = readUint32BE(view, 20);
  const bitDepth = data[24];
  const colorType = PNG_COLOR_TYPES[data[25]] ?? 'unknown';
  return {
    mimeType: mimeType || 'image/png',
    ext: ext || 'png',
    fileSizeBytes: fileSizeBytes ?? data.length,
    width,
    height,
    bitDepth,
    colorType,
  };
}

function parseJpegMetadata(bytes, { mimeType, ext, fileSizeBytes }) {
  const data = toUint8Array(bytes);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = (data[offset + 2] << 8) + data[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > data.length) break;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && segmentLength >= 7) {
      const bitDepth = data[offset + 4];
      const height = (data[offset + 5] << 8) + data[offset + 6];
      const width = (data[offset + 7] << 8) + data[offset + 8];
      return {
        mimeType: mimeType || 'image/jpeg',
        ext: ext || 'jpg',
        fileSizeBytes: fileSizeBytes ?? data.length,
        width,
        height,
        bitDepth: bitDepth || 8,
        colorType: 'rgb',
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpMetadata(bytes, { mimeType, ext, fileSizeBytes }) {
  const data = toUint8Array(bytes);
  if (data.length < 30) return null;
  const riff = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const webp = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunk = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    const chunkSize = data[offset + 4]
      | (data[offset + 5] << 8)
      | (data[offset + 6] << 16)
      | (data[offset + 7] << 24);
    const chunkStart = offset + 8;
    if (chunk === 'VP8X' && chunkSize >= 10 && chunkStart + 10 <= data.length) {
      const width = 1 + (data[chunkStart + 4] | (data[chunkStart + 5] << 8) | (data[chunkStart + 6] << 16));
      const height = 1 + (data[chunkStart + 7] | (data[chunkStart + 8] << 8) | (data[chunkStart + 9] << 16));
      return {
        mimeType: mimeType || 'image/webp',
        ext: ext || 'webp',
        fileSizeBytes: fileSizeBytes ?? data.length,
        width,
        height,
        bitDepth: 8,
        colorType: 'rgba',
      };
    }
    if (chunk === 'VP8 ' && chunkSize >= 10 && chunkStart + 10 <= data.length) {
      const width = data[chunkStart + 6] | (data[chunkStart + 7] << 8);
      const height = data[chunkStart + 8] | (data[chunkStart + 9] << 8);
      return {
        mimeType: mimeType || 'image/webp',
        ext: ext || 'webp',
        fileSizeBytes: fileSizeBytes ?? data.length,
        width,
        height,
        bitDepth: 8,
        colorType: 'rgb',
      };
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  return null;
}

/**
 * @param {Uint8Array | Buffer | ArrayBuffer} bytes
 * @param {{ mimeType?: string, ext?: string, fileSizeBytes?: number }} [hints]
 */
export function parseImageMetadata(bytes, hints = {}) {
  if (!bytes) return null;
  const { mimeType, ext } = hints;
  const normalizedExt = String(ext || '').toLowerCase();
  const normalizedMime = String(mimeType || '').toLowerCase();

  if (normalizedExt === 'png' || normalizedMime === 'image/png') {
    return parsePngMetadata(bytes, hints) || parsePngMetadata(bytes, { ...hints, mimeType: 'image/png', ext: 'png' });
  }
  if (normalizedExt === 'jpg' || normalizedExt === 'jpeg' || normalizedMime === 'image/jpeg') {
    return parseJpegMetadata(bytes, hints);
  }
  if (normalizedExt === 'webp' || normalizedMime === 'image/webp') {
    return parseWebpMetadata(bytes, hints);
  }

  return parsePngMetadata(bytes, hints)
    || parseJpegMetadata(bytes, hints)
    || parseWebpMetadata(bytes, hints);
}

/**
 * @param {Uint8Array | Buffer} bytes
 * @param {{ mimeType?: string, ext?: string, width?: number, height?: number }} [options]
 */
export function buildImageArtifactMetadata(bytes, options = {}) {
  const fileSizeBytes = bytes?.length ?? options.fileSizeBytes ?? 0;
  const parsed = parseImageMetadata(bytes, {
    mimeType: options.mimeType,
    ext: options.ext,
    fileSizeBytes,
  });
  if (parsed) return parsed;
  return {
    mimeType: options.mimeType || 'image/png',
    ext: options.ext || 'png',
    fileSizeBytes,
    width: options.width ?? 0,
    height: options.height ?? 0,
    bitDepth: 8,
    colorType: 'rgb',
  };
}

export function formatImageFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatImageDimensions(meta) {
  const width = Number(meta?.width);
  const height = Number(meta?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return `${width} × ${height}`;
}

function pickImageMetadataSlice(meta, { fileSizeBytes } = {}) {
  if (!meta || typeof meta !== 'object') return null;
  const nested = meta.image && typeof meta.image === 'object' ? meta.image : null;
  const width = nested?.width ?? meta.width;
  const height = nested?.height ?? meta.height;
  const resolvedFileSize = nested?.fileSizeBytes
    ?? meta.fileSizeBytes
    ?? fileSizeBytes
    ?? meta.size;
  const slice = {
    mimeType: nested?.mimeType ?? meta.mimeType,
    ext: nested?.ext ?? meta.ext,
    fileSizeBytes: resolvedFileSize,
    width: Number.isFinite(Number(width)) ? Number(width) : undefined,
    height: Number.isFinite(Number(height)) ? Number(height) : undefined,
    bitDepth: nested?.bitDepth ?? meta.bitDepth,
    colorType: nested?.colorType ?? meta.colorType,
  };
  const hasValue = Object.values(slice).some((value) => value != null && value !== '');
  return hasValue ? slice : null;
}

export function formatImageBitDepth(meta) {
  if (!meta?.bitDepth) return null;
  return `${meta.bitDepth}-bit`;
}

/**
 * @param {object | null | undefined} artifactMeta
 * @param {object | null | undefined} version
 */
export function resolveImageMetadata(artifactMeta, version = null) {
  const slices = [
    version?.imageMetadata,
    pickImageMetadataSlice(version?.generatedMetadata, { fileSizeBytes: version?.size }),
    pickImageMetadataSlice(artifactMeta),
  ].filter(Boolean);

  if (slices.length === 0) return null;

  return slices.reduce((merged, slice) => {
    const next = { ...merged };
    for (const [key, value] of Object.entries(slice)) {
      if (value != null && value !== '') {
        next[key] = value;
      }
    }
    return next;
  }, {});
}

export function isGeneratedImageMetadata(meta) {
  return meta?.canvas_kind === 'generated_image'
    || Boolean(meta?.originalPromptSnapshot)
    || Boolean(meta?.executionId);
}

/**
 * @param {object | null | undefined} artifactMeta
 * @param {object | null | undefined} version
 */
export function resolveGeneratedImageProvenance(artifactMeta, version = null) {
  const generated = version?.generatedMetadata && typeof version.generatedMetadata === 'object'
    ? version.generatedMetadata
    : {};
  return {
    provider: artifactMeta?.provider ?? generated.provider ?? null,
    model: artifactMeta?.model ?? generated.model ?? null,
  };
}
