import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { flowEdgeProperties, patchFlowEdge } from '../domain/flowDocument.js';
import {
  FLOW_CONNECTION_CONDITION_DECISION_VALUES,
  flowEdgeCondition,
  getFlowConnectionType,
  listFlowConnectionTypes,
  resolveFlowEdgeConnectionTypeFields,
  resolveFlowConnectionLabel,
  suggestFlowConnectionConditionValue,
} from '../domain/flowConnectionTypes.js';

/**
 * @param {{ edge: object, onPatch: (patch: object) => void }} props
 */
export function FlowConnectionInspectorFields({ edge, onPatch }) {
  const { connectionTypeId, connectionTypeCustom } = resolveFlowEdgeConnectionTypeFields(edge);
  const condition = flowEdgeCondition(edge);
  const selectedType = getFlowConnectionType(connectionTypeId);
  const properties = flowEdgeProperties(edge);
  const propertyEntries = Object.entries(properties);
  const resolvedLabel = resolveFlowConnectionLabel(edge);
  const conditionMode = condition?.type === 'decision' ? 'decision' : 'none';

  const applyPatch = (patch) => {
    onPatch(patchFlowEdge(edge, patch));
  };

  const setConnectionTypeId = (nextTypeId) => {
    applyPatch({
      connectionTypeId: nextTypeId,
      ...(nextTypeId === '' ? { connectionTypeCustom: '', condition: null } : {}),
    });
  };

  const setConditionMode = (nextMode) => {
    if (nextMode === 'none') {
      applyPatch({ condition: null });
      return;
    }
    const suggested = suggestFlowConnectionConditionValue(connectionTypeId) ?? 'approved';
    applyPatch({
      condition: {
        type: 'decision',
        value: condition?.value ?? suggested,
      },
    });
  };

  const setConditionValue = (value) => {
    applyPatch({ condition: { type: 'decision', value } });
  };

  const setProperty = (index, key, value) => {
    const entries = [...propertyEntries];
    entries[index] = [key, value];
    applyPatch({ properties: Object.fromEntries(entries) });
  };

  const addProperty = () => {
    const entries = [...propertyEntries, ['', '']];
    applyPatch({ properties: Object.fromEntries(entries) });
  };

  const removeProperty = (index) => {
    const entries = propertyEntries.filter((_, entryIndex) => entryIndex !== index);
    applyPatch({ properties: Object.fromEntries(entries) });
  };

  return (
    <div className="space-y-3 mb-4">
      <div>
        <label className="sans text-[10px] text-muted">{strings.flow.connectionType}</label>
        <select
          value={connectionTypeId}
          onChange={(event) => setConnectionTypeId(event.target.value)}
          className="sans mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="">{strings.flow.connectionTypeUnspecified}</option>
          {listFlowConnectionTypes().map((type) => (
            <option key={type.id} value={type.id}>{type.label}</option>
          ))}
        </select>
        {selectedType?.description && (
          <p className="sans text-xs text-muted mt-1">{selectedType.description}</p>
        )}
      </div>

      {connectionTypeId && selectedType?.allowsCustomText && (
        <div>
          <label className="sans text-[10px] text-muted">{strings.flow.connectionTypeCustom}</label>
          <input
            value={connectionTypeCustom}
            onChange={(event) => applyPatch({ connectionTypeCustom: event.target.value })}
            placeholder={strings.flow.connectionTypeCustom}
            className="sans mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {connectionTypeId && (
        <div>
          <label className="sans text-[10px] text-muted">{strings.flow.connectionCondition}</label>
          <select
            value={conditionMode}
            onChange={(event) => setConditionMode(event.target.value)}
            className="sans mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent"
          >
            <option value="none">{strings.flow.connectionConditionNone}</option>
            <option value="decision">{strings.flow.connectionConditionDecision}</option>
          </select>
          {conditionMode === 'decision' && (
            <select
              value={condition?.value ?? 'approved'}
              onChange={(event) => setConditionValue(event.target.value)}
              className="sans mt-2 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              {FLOW_CONNECTION_CONDITION_DECISION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {strings.flow.connectionConditionValueLabels[value]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {connectionTypeId && resolvedLabel && (
        <p className="sans text-xs text-muted" role="status">
          {strings.flow.connectionLabelPreview(resolvedLabel)}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="sans text-[10px] text-muted">{strings.flow.connectionProperties}</span>
          <button
            type="button"
            onClick={addProperty}
            className="sans text-[10px] text-link hover:text-link-hover hover:underline inline-flex items-center gap-1"
          >
            <Plus size={12} />
            {strings.flow.connectionAddProperty}
          </button>
        </div>
        {propertyEntries.length === 0 ? (
          <p className="sans text-xs text-muted">{strings.flow.connectionPropertiesEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {propertyEntries.map(([key, value], index) => (
              <li key={`${index}-${key}`} className="flex items-center gap-1.5">
                <input
                  value={key}
                  onChange={(event) => setProperty(index, event.target.value, value)}
                  placeholder={strings.flow.connectionPropertyKey}
                  className="sans min-w-0 flex-1 rounded-md border border-border bg-canvas px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                />
                <input
                  value={value}
                  onChange={(event) => setProperty(index, key, event.target.value)}
                  placeholder={strings.flow.connectionPropertyValue}
                  className="sans min-w-0 flex-[1.5] rounded-md border border-border bg-canvas px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  aria-label={strings.flow.connectionRemoveProperty}
                  onClick={() => removeProperty(index)}
                  className="text-muted hover:text-danger p-1 shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
