import {
  cardKeyFromFilename,
} from '../../../lib/filename.js';
import { buildImageArtifactMetadata } from '../../../lib/image/imageArtifactMetadata.js';

function mimeFromDataUrl(dataUrl) {
  return String(dataUrl ?? '').match(/^data:([^;,]+)/)?.[1] || 'image/png';
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl ?? '').split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function resolveOutputImageMetadata(output, { preview = null } = {}) {
  const ext = (output.filename || '').split('.').pop()?.toLowerCase() || 'png';
  const width = output.metadata?.image?.width
    ?? output.metadata?.width
    ?? output.width;
  const height = output.metadata?.image?.height
    ?? output.metadata?.height
    ?? output.height;
  const fileSizeBytes = output.metadata?.image?.fileSizeBytes
    ?? preview?.size
    ?? null;

  if (output.metadata?.image) {
    return {
      ...output.metadata.image,
      width: output.metadata.image.width ?? width,
      height: output.metadata.image.height ?? height,
      fileSizeBytes: output.metadata.image.fileSizeBytes ?? fileSizeBytes,
    };
  }

  const dataUrl = output.dataUrl;
  if (!dataUrl) return null;
  const bytes = dataUrlToBytes(dataUrl);
  return buildImageArtifactMetadata(bytes, {
    mimeType: mimeFromDataUrl(dataUrl),
    ext,
    fileSizeBytes: fileSizeBytes ?? bytes.length,
    width,
    height,
  });
}

export function relativePathFromOutput(output) {
  return String(output?.filePath ?? '').replace(/^projects\/[^/]+\//, '') || null;
}

export const IMAGE_GENERATION_AGENT_TYPE_ID = 'agent_type_image_generation';

export const DEFAULT_IMAGE_AGENT_SETTINGS = Object.freeze({
  provider: 'local',
  aspectRatio: '1:1',
  quality: 'standard',
  imageCount: 1,
  outputFormat: 'png',
});

export function agentCardFromRecord(agent, position = { x: 100, y: 100 }) {
  return {
    id: crypto.randomUUID(),
    key: `agent__${agent.id}`,
    prefix: 'agent',
    name: agent.name,
    type: 'agent',
    agentArtifactId: agent.id,
    agentTypeId: agent.agentTypeId,
    projectId: agent.projectId,
    x: position.x,
    y: position.y,
    w: 240,
    h: 240,
    versions: [{
      version: 1,
      artifactRef: { id: agent.id, type: 'artifact' },
      agentArtifactId: agent.id,
      inline: true,
      ext: 'agent',
      filename: `agent__${agent.id}.agent`,
    }],
    pinnedVersion: 1,
  };
}

export function folderBackedGeneratedImageCard(
  output,
  position = { x: 120, y: 120 },
  { folderWritten = false, preview = null } = {},
) {
  const filename = output.filename || output.filePath?.split('/').pop() || `generated__${output.id}.png`;
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  const relativePath = relativePathFromOutput(output);
  const folderKey = relativePath
    ? cardKeyFromFilename(relativePath)
    : `generated__${output.id}`;

  const version = {
    version: 1,
    artifactRef: { id: output.id, type: 'artifact' },
    filename,
    relativePath,
    content_hash: output.contentHash,
    ext,
    ...(output.metadata ? { generatedMetadata: output.metadata } : {}),
  };

  const imageMetadata = preview?.imageMetadata
    ?? resolveOutputImageMetadata(output, { preview });
  if (imageMetadata) {
    version.imageMetadata = imageMetadata;
  }

  if (folderWritten && preview) {
    version.objectUrl = preview.objectUrl;
    version.previewCacheKey = preview.previewCacheKey;
    version.size = preview.size;
    version.previewStripped = preview.previewStripped ?? false;
  } else if (!folderWritten) {
    version.dataUrl = output.dataUrl;
    version.inline = true;
  }

  return {
    id: crypto.randomUUID(),
    key: folderKey,
    prefix: 'generated',
    name: filename.replace(/\.[^.]+$/, ''),
    type: 'image',
    x: position.x,
    y: position.y,
    w: 280,
    h: 220,
    versions: [version],
    pinnedVersion: 1,
  };
}

export function generatedImageCardFromOutput(output, position = { x: 120, y: 120 }) {
  return folderBackedGeneratedImageCard(output, position, { folderWritten: false });
}

export function summarizeAgentStatus(executions = []) {
  const latest = executions[0];
  if (!latest) return 'Never run';
  if (latest.status === 'completed') return `Execution #${String(latest.executionNumber).padStart(4, '0')}`;
  return latest.status;
}
