import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConverterWithMock(mock) {
  vi.resetModules();
  vi.doMock('@thatopen/fragments', () => mock);
  return import('../fragmentsConversion.js');
}

describe('Fragments conversion', () => {
  afterEach(() => {
    vi.doUnmock('@thatopen/fragments');
    vi.resetModules();
  });

  it('returns a fragments source marker on successful conversion', async () => {
    let processInput = null;
    const { convertIfcToFragmentsBlob } = await loadConverterWithMock({
      IfcImporter: class {
        async process(input) {
          processInput = input;
          return new Uint8Array([1, 2, 3]);
        }
      },
    });

    const result = await convertIfcToFragmentsBlob(new Uint8Array([9, 9, 9]).buffer, { modelId: 'model-1' });

    expect(result.status).toBe('success');
    expect(result.sourceKind).toBe('fragments');
    expect(result.modelId).toBe('model-1');
    expect(processInput.id).toBe('model-1');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(await result.blob.arrayBuffer()).toHaveProperty('byteLength', 3);
  });

  it('does not cache source IFC bytes when conversion fails', async () => {
    const { convertIfcToFragmentsBlob } = await loadConverterWithMock({
      IfcImporter: class {
        async process() {
          throw new Error('converter broke');
        }
      },
    });

    const result = await convertIfcToFragmentsBlob(new Uint8Array([9, 9, 9]).buffer);

    expect(result.status).toBe('failed');
    expect(result.sourceKind).toBe('none');
    expect(result.blob).toBeNull();
    expect(result.error).toBe('converter broke');
  });
});
