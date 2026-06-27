import { describe, expect, it } from 'vitest';
import { validateFlowEdgeMetadata } from '../../../src/features/flow/domain/flowDocument.js';

// validateSnapshot edge loop — exercised via the same helper used in replaceFlow
describe('flow edge metadata validation', () => {
  it('accepts typed edges with string properties', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Depends on',
      data: {
        connectionTypeId: 'depends_on',
        connectionTypeCustom: '',
        properties: { format: 'json' },
      },
    })).not.toThrow();
  });

  it('accepts legacy connection type ids via normalization', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Depends on',
      data: {
        connectionTypeId: 'driven_by',
        connectionTypeCustom: '',
      },
    })).not.toThrow();
  });

  it('accepts schema v2 produces edges', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Produces',
      data: {
        connectionTypeId: 'produces',
        connectionTypeCustom: '',
      },
    })).not.toThrow();
  });

  it('accepts evaluated_by connection type', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      label: 'Evaluated by',
      data: {
        connectionTypeId: 'evaluated_by',
        connectionTypeCustom: '',
      },
    })).not.toThrow();
  });

  it('accepts optional decision conditions', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: {
        connectionTypeId: 'approves',
        condition: { type: 'decision', value: 'approved' },
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

  it('rejects invalid decision conditions', () => {
    expect(() => validateFlowEdgeMetadata({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      data: {
        connectionTypeId: 'approves',
        condition: { type: 'decision', value: 'maybe' },
      },
    })).toThrow(/invalid flow edge connection condition/);
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
