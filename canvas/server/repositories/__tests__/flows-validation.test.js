import { describe, expect, it } from 'vitest';
import { validateFlowEdgeMetadata } from '../../../src/features/flow/domain/flowDocument.js';

// validateSnapshot edge loop — exercised via the same helper used in replaceFlow
describe('flow edge metadata validation', () => {
  it('accepts typed edges with string properties', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Driven by',
      data: {
        connectionTypeId: 'driven_by',
        connectionTypeCustom: '',
        properties: { format: 'json' },
      },
    })).not.toThrow();
  });

  it('accepts schema types with optional detail', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Driven by: Love',
      data: {
        connectionTypeId: 'driven_by',
        connectionTypeCustom: 'Love',
      },
    })).not.toThrow();
  });

  it('accepts legacy edges without connection type metadata', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'legacy',
      data: { flowing: false },
    })).not.toThrow();
  });

  it('rejects custom type without label text', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: {
        connectionTypeId: 'custom',
        connectionTypeCustom: '   ',
      },
    })).toThrow(/custom flow edge connection requires/);
  });
});
