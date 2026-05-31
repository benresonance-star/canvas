import { isUlid } from './shared/ulid.js';
import { ARTIFACT_TYPES } from './shared/types.js';

export function validateArtifact(artifact) {
  if (!artifact?.id || !isUlid(artifact.id)) {
    throw new Error('artifact.id: invalid ULID');
  }
  if (!ARTIFACT_TYPES.includes(artifact.type)) {
    throw new Error(`artifact.type: invalid "${artifact.type}"`);
  }
  if (!artifact.uri || typeof artifact.uri !== 'string') {
    throw new Error('artifact.uri is required');
  }
  if (!artifact.content_hash || typeof artifact.content_hash !== 'string') {
    throw new Error('artifact.content_hash is required');
  }
  if (artifact.confidence != null) {
    throw new Error('artifact must not carry confidence');
  }
  if (!artifact.retrieved_at) {
    throw new Error('artifact.retrieved_at is required');
  }
}

export function createArtifact(fields) {
  const artifact = {
    metadata: {},
    ...fields,
  };
  validateArtifact(artifact);
  return artifact;
}
