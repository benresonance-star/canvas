import { bimPipelineVersions } from './versions.js';

export function computeBimModelFingerprint({
  sourceFileHash,
  ifcSchemaVersion = 'unknown-ifc-schema',
  versions = bimPipelineVersions(),
} = {}) {
  const hash = String(sourceFileHash ?? '').trim();
  if (!hash) throw new Error('Cannot fingerprint BIM model without sourceFileHash');
  return [
    'bim',
    hash,
    ifcSchemaVersion || 'unknown-ifc-schema',
    versions.fragmentsConverterVersion,
    versions.projectionSchemaVersion,
    versions.connectorRuleVersion,
  ].join(':');
}
