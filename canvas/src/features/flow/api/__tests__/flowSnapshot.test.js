import { describe, expect, it, vi } from 'vitest';
import { flowSnapshotPath, writeFlowSnapshot } from '../flowSnapshot.js';

describe('flow snapshots', () => {
  it('writes a versioned JSON mirror under the flows directory', async () => {
    const write = vi.fn();
    const close = vi.fn();
    const getFileHandle = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
    }));
    const getDirectoryHandle = vi.fn(async () => ({ getFileHandle }));
    const folder = {
      queryPermission: vi.fn(async () => 'granted'),
      getDirectoryHandle,
    };

    const result = await writeFlowSnapshot(folder, {
      id: 'flow-1',
      title: 'Customer Onboarding',
      revision: 2,
      nodes: [],
      edges: [],
    });

    expect(flowSnapshotPath({ id: 'flow-1', title: 'Customer Onboarding' }))
      .toBe('flows/customer-onboarding--flow-1.flow.json');
    expect(getDirectoryHandle).toHaveBeenCalledWith('flows', { create: true });
    expect(getFileHandle).toHaveBeenCalledWith('customer-onboarding--flow-1.flow.json', { create: true });
    expect(write.mock.calls[0][0]).toContain('"schemaVersion": 1');
    expect(close).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, path: 'flows/customer-onboarding--flow-1.flow.json' });
  });
});

