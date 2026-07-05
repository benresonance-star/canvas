export function fragmentsRuntimeModelId(fingerprint) {
  return `canvas-bim-${String(fingerprint ?? 'model')
    .replace(/^canvas-bim-/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 32)
    .replace(/^-+|-+$/g, '') || 'model'}`;
}

export async function convertIfcToFragmentsBlob(arrayBuffer, { modelId = null } = {}) {
  try {
    const Fragments = await import('@thatopen/fragments');
    const Importer = Fragments.IfcImporter;
    if (!Importer) {
      return {
        status: 'failed',
        sourceKind: 'none',
        blob: null,
        error: 'That Open IfcImporter API was not available.',
      };
    }
    const importer = new Importer();
    importer.wasm = { path: '/node_modules/web-ifc/', absolute: false };
    const bytes = new Uint8Array(arrayBuffer);
    const data = await importer.process({ bytes, id: modelId ?? undefined });
    if (data instanceof Uint8Array && data.byteLength > 0) {
      return {
        status: 'success',
        sourceKind: 'fragments',
        modelId,
        blob: new Blob([data], { type: 'application/octet-stream' }),
        warning: null,
      };
    }
    return {
      status: 'failed',
      sourceKind: 'none',
      blob: null,
      error: 'Fragments conversion returned an empty or unsupported payload.',
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceKind: 'none',
      blob: null,
      error: error?.message || 'Fragments converter unavailable.',
    };
  }
}
