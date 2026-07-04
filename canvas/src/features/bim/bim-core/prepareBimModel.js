import { computeBimModelFingerprint } from './fingerprint.js';
import { projectIfcEvidence } from './ifcProjection.js';
import { convertIfcToFragmentsBlob, fragmentsRuntimeModelId } from './fragmentsConversion.js';

export async function prepareBimModel({
  arrayBuffer,
  version,
  repository,
  onPhase = () => {},
  onProgress = () => {},
}) {
  const sourceFileHash = version?.content_hash;
  const fingerprint = computeBimModelFingerprint({ sourceFileHash });
  onPhase('preparing');
  onProgress({ kind: 'phase', message: 'Computing BIM preparation fingerprint' });
  const cached = await repository.getPreparedModel(fingerprint);
  if (cached) {
    onProgress({ kind: 'cache', message: 'Prepared BIM cache found; skipping IFC extraction' });
    onPhase('ready');
    return { fingerprint, preparedModel: cached, reused: true };
  }

  const createdAt = new Date().toISOString();
  const metadata = {
    fingerprint,
    sourceFileHash,
    sourceFilePath: version?.relativePath ?? version?.filename ?? null,
    filename: version?.filename ?? 'model.ifc',
    sizeBytes: version?.size ?? arrayBuffer?.byteLength ?? 0,
    ifcSchema: 'unknown',
    createdAt,
  };
  const fragmentsModelId = fragmentsRuntimeModelId(fingerprint);

  onPhase('converting_ifc');
  onProgress({ kind: 'phase', message: 'Converting IFC geometry to Fragments' });
  const fragments = await convertIfcToFragmentsBlob(arrayBuffer, { modelId: fragmentsModelId });
  onPhase('extracting_properties');
  onProgress({ kind: 'phase', message: 'Opening IFC evidence model with web-ifc' });
  const projected = await projectIfcEvidence({ arrayBuffer, metadata, onProgress });
  onPhase('building_index');
  onProgress({
    kind: 'phase',
    message: `Building local BIM index from ${projected.elements?.length ?? 0} elements and ${projected.properties?.length ?? 0} properties`,
  });
  const preparedModel = {
    ...projected,
    fragmentsBlob: fragments.blob,
    metadata: {
      ...metadata,
      status: 'ready',
      fragmentsStatus: fragments.status,
      fragmentsSourceKind: fragments.sourceKind,
      fragmentsModelId,
      fragmentsError: fragments.error ?? null,
      cachedAt: createdAt,
    },
    warnings: [
      ...(projected.warnings ?? []),
      ...(fragments.warning ? [fragments.warning] : []),
      ...(fragments.error ? [`Fragments conversion failed: ${fragments.error}`] : []),
    ],
  };
  await repository.putPreparedModel(fingerprint, preparedModel);
  onProgress({ kind: 'ready', message: 'BIM preparation complete' });
  onPhase('ready');
  return { fingerprint, preparedModel, reused: false };
}
