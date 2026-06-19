import { describe, expect, it } from 'vitest';
import {
  FLOW_CONNECTION_CUSTOM_TYPE_ID,
  flowEdgeConnectionTypeCustom,
  flowEdgeConnectionTypeId,
  formatFlowConnectionLabel,
  getFlowConnectionType,
  inferFlowEdgeConnectionTypeState,
  isKnownFlowConnectionTypeId,
  listFlowConnectionTypes,
  resolveFlowConnectionLabel,
} from '../flowConnectionTypes.js';

describe('flowConnectionTypes', () => {
  it('lists schema types including custom', () => {
    const ids = listFlowConnectionTypes().map((type) => type.id);
    expect(ids).toContain('driven_by');
    expect(ids).toContain('output_type');
    expect(ids).toContain(FLOW_CONNECTION_CUSTOM_TYPE_ID);
  });

  it('resolves known type labels', () => {
    const edge = {
      label: '',
      data: { connectionTypeId: 'driven_by' },
    };
    expect(resolveFlowConnectionLabel(edge)).toBe('Driven by');
    expect(getFlowConnectionType('output_type')?.label).toBe('Output type');
  });

  it('appends optional detail for schema types', () => {
    expect(formatFlowConnectionLabel('driven_by', 'Love')).toBe('Driven by: Love');
    expect(formatFlowConnectionLabel('driven_by', '')).toBe('Driven by');
    expect(resolveFlowConnectionLabel({
      data: { connectionTypeId: 'driven_by', connectionTypeCustom: 'Love' },
    })).toBe('Driven by: Love');
  });

  it('resolves custom type from custom text without prefix', () => {
    const edge = {
      data: {
        connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
        connectionTypeCustom: 'feeds',
      },
    };
    expect(resolveFlowConnectionLabel(edge)).toBe('feeds');
    expect(flowEdgeConnectionTypeCustom(edge)).toBe('feeds');
  });

  it('falls back to legacy label when type is unknown', () => {
    const edge = {
      label: 'legacy link',
      data: { connectionTypeId: 'missing_type' },
    };
    expect(resolveFlowConnectionLabel(edge)).toBe('legacy link');
  });

  it('infers custom state from legacy label-only edges', () => {
    expect(inferFlowEdgeConnectionTypeState({ label: 'manual' })).toEqual({
      connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
      connectionTypeCustom: 'manual',
    });
    expect(inferFlowEdgeConnectionTypeState({ label: 'Driven by' })).toEqual({
      connectionTypeId: 'driven_by',
      connectionTypeCustom: '',
    });
    expect(inferFlowEdgeConnectionTypeState({ label: 'Driven by: Love' })).toEqual({
      connectionTypeId: 'driven_by',
      connectionTypeCustom: 'Love',
    });
    expect(flowEdgeConnectionTypeId({ data: { connectionTypeId: 'depends_on' } })).toBe('depends_on');
  });

  it('validates known connection type ids', () => {
    expect(isKnownFlowConnectionTypeId('')).toBe(true);
    expect(isKnownFlowConnectionTypeId('driven_by')).toBe(true);
    expect(isKnownFlowConnectionTypeId('unknown')).toBe(false);
  });
});
