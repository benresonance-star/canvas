import { describe, expect, it } from 'vitest';
import {
  FLOW_CONNECTION_CUSTOM_TYPE_ID,
  FLOW_CONNECTION_TYPE_SCHEMA,
  flowEdgeCondition,
  flowEdgeConnectionTypeCustom,
  flowEdgeConnectionTypeId,
  formatFlowConnectionConditionLabel,
  formatFlowConnectionLabel,
  getFlowConnectionType,
  inferFlowEdgeConnectionTypeState,
  isKnownFlowConnectionTypeId,
  listFlowConnectionTypes,
  normalizeFlowConnectionTypeId,
  normalizeFlowEdgeCondition,
  resolveFlowConnectionLabel,
  resolveFlowEdgeConnectionTypeFields,
  suggestFlowConnectionConditionValue,
  validateFlowEdgeCondition,
} from '../flowConnectionTypes.js';

describe('flowConnectionTypes', () => {
  it('lists Path-aligned schema types including custom', () => {
    const ids = listFlowConnectionTypes().map((type) => type.id);
    expect(FLOW_CONNECTION_TYPE_SCHEMA.version).toBe(2);
    expect(ids).toEqual([
      'depends_on',
      'produces',
      'evaluated_by',
      'approves',
      'revises',
      'rejects',
      'loops_to',
      FLOW_CONNECTION_CUSTOM_TYPE_ID,
    ]);
  });

  it('migrates legacy connection type ids', () => {
    expect(normalizeFlowConnectionTypeId('driven_by')).toBe('depends_on');
    expect(normalizeFlowConnectionTypeId('output_type')).toBe('produces');
    expect(getFlowConnectionType('driven_by')?.label).toBe('Depends on');
    expect(getFlowConnectionType('output_type')?.label).toBe('Produces');
  });

  it('resolves known type labels', () => {
    const edge = {
      label: '',
      data: { connectionTypeId: 'depends_on' },
    };
    expect(resolveFlowConnectionLabel(edge)).toBe('Depends on');
    expect(getFlowConnectionType('produces')?.label).toBe('Produces');
    expect(getFlowConnectionType('evaluated_by')?.label).toBe('Evaluated by');
    expect(resolveFlowConnectionLabel({
      data: { connectionTypeId: 'evaluated_by' },
    })).toBe('Evaluated by');
  });

  it('appends optional decision condition suffix to labels', () => {
    const condition = { type: 'decision', value: 'approved' };
    expect(formatFlowConnectionLabel('approves', '', condition)).toBe('Approves · Approved');
    expect(formatFlowConnectionLabel('depends_on', '')).toBe('Depends on');
    expect(resolveFlowConnectionLabel({
      data: {
        connectionTypeId: 'approves',
        condition: { type: 'decision', value: 'revise' },
      },
    })).toBe('Approves · Revise');
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
      condition: null,
    });
    expect(inferFlowEdgeConnectionTypeState({ label: 'Driven by' })).toEqual({
      connectionTypeId: 'depends_on',
      connectionTypeCustom: '',
      condition: null,
    });
    expect(inferFlowEdgeConnectionTypeState({ label: 'Driven by: Love' })).toEqual({
      connectionTypeId: 'depends_on',
      connectionTypeCustom: '',
      condition: null,
    });
    expect(flowEdgeConnectionTypeId({ data: { connectionTypeId: 'depends_on' } })).toBe('depends_on');
  });

  it('validates known connection type ids including legacy aliases', () => {
    expect(isKnownFlowConnectionTypeId('')).toBe(true);
    expect(isKnownFlowConnectionTypeId('driven_by')).toBe(true);
    expect(isKnownFlowConnectionTypeId('approves')).toBe(true);
    expect(isKnownFlowConnectionTypeId('evaluated_by')).toBe(true);
    expect(isKnownFlowConnectionTypeId('unknown')).toBe(false);
  });

  it('returns no label when connection type is explicitly unspecified', () => {
    const edge = {
      label: 'Depends on',
      data: { connectionTypeId: '', connectionTypeCustom: '' },
    };
    expect(resolveFlowConnectionLabel(edge)).toBe('');
    expect(resolveFlowEdgeConnectionTypeFields(edge)).toEqual({
      connectionTypeId: '',
      connectionTypeCustom: '',
      condition: null,
    });
  });

  it('still infers legacy label-only edges without explicit type data', () => {
    expect(resolveFlowEdgeConnectionTypeFields({ label: 'Driven by' })).toEqual({
      connectionTypeId: 'depends_on',
      connectionTypeCustom: '',
      condition: null,
    });
    expect(resolveFlowConnectionLabel({ label: 'Driven by' })).toBe('Depends on');
  });

  it('normalizes and validates decision conditions', () => {
    expect(normalizeFlowEdgeCondition({ type: 'decision', value: 'approved' })).toEqual({
      type: 'decision',
      value: 'approved',
    });
    expect(normalizeFlowEdgeCondition({ type: 'decision', value: 'bad' })).toBeNull();
    expect(formatFlowConnectionConditionLabel({ type: 'decision', value: 'reject' })).toBe('Reject');
    expect(() => validateFlowEdgeCondition({ type: 'bad', value: 'approved' })).toThrow(/invalid flow edge connection condition/);
    expect(flowEdgeCondition({
      data: { condition: { type: 'decision', value: 'revise' } },
    })).toEqual({ type: 'decision', value: 'revise' });
  });

  it('suggests default decision values for approval-related types', () => {
    expect(suggestFlowConnectionConditionValue('approves')).toBe('approved');
    expect(suggestFlowConnectionConditionValue('revises')).toBe('revise');
    expect(suggestFlowConnectionConditionValue('rejects')).toBe('reject');
    expect(suggestFlowConnectionConditionValue('depends_on')).toBeNull();
  });
});
