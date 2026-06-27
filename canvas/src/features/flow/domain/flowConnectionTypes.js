export const FLOW_CONNECTION_CUSTOM_TYPE_ID = 'custom';

export const FLOW_CONNECTION_CONDITION_DECISION_VALUES = Object.freeze([
  'approved',
  'revise',
  'reject',
]);

/** @type {Readonly<Record<string, string>>} */
export const LEGACY_FLOW_CONNECTION_TYPE_IDS = Object.freeze({
  driven_by: 'depends_on',
  output_type: 'produces',
});

/** @type {Readonly<Record<string, string>>} */
const LEGACY_FLOW_CONNECTION_LABEL_ALIASES = Object.freeze({
  'Driven by': 'depends_on',
  'Output type': 'produces',
});

/** @type {Readonly<Record<string, string>>} */
const TYPE_DEFAULT_CONDITION_VALUE = Object.freeze({
  approves: 'approved',
  revises: 'revise',
  rejects: 'reject',
});

/** @type {Readonly<Record<string, string>>} */
const CONDITION_VALUE_LABELS = Object.freeze({
  approved: 'Approved',
  revise: 'Revise',
  reject: 'Reject',
});

export const FLOW_CONNECTION_TYPE_SCHEMA = Object.freeze({
  version: 2,
  types: Object.freeze([
    Object.freeze({
      id: 'depends_on',
      label: 'Depends on',
      description: 'Target step depends on the source.',
    }),
    Object.freeze({
      id: 'produces',
      label: 'Produces',
      description: 'Source produces output for the target step.',
    }),
    Object.freeze({
      id: 'approves',
      label: 'Approves',
      description: 'Approval transition to the next step.',
    }),
    Object.freeze({
      id: 'revises',
      label: 'Revises',
      description: 'Send work back for revision.',
    }),
    Object.freeze({
      id: 'rejects',
      label: 'Rejects',
      description: 'Reject or block this path.',
    }),
    Object.freeze({
      id: 'loops_to',
      label: 'Loops to',
      description: 'Loop back to an earlier step.',
    }),
    Object.freeze({
      id: FLOW_CONNECTION_CUSTOM_TYPE_ID,
      label: 'Custom…',
      allowsCustomText: true,
      description: 'Enter your own relationship label.',
    }),
  ]),
});

const TYPE_BY_ID = new Map(
  FLOW_CONNECTION_TYPE_SCHEMA.types.map((type) => [type.id, type]),
);

/**
 * @param {string | null | undefined} id
 */
export function normalizeFlowConnectionTypeId(id) {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key) return '';
  return LEGACY_FLOW_CONNECTION_TYPE_IDS[key] ?? key;
}

/**
 * @param {string | null | undefined} id
 */
export function getFlowConnectionType(id) {
  const key = normalizeFlowConnectionTypeId(id);
  if (!key) return null;
  return TYPE_BY_ID.get(key) ?? null;
}

export function listFlowConnectionTypes() {
  return FLOW_CONNECTION_TYPE_SCHEMA.types;
}

/**
 * @param {string | null | undefined} id
 */
export function isKnownFlowConnectionTypeId(id) {
  const key = normalizeFlowConnectionTypeId(id);
  return key === '' || TYPE_BY_ID.has(key);
}

/**
 * @param {unknown} raw
 */
export function normalizeFlowEdgeCondition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.type !== 'decision') return null;
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!FLOW_CONNECTION_CONDITION_DECISION_VALUES.includes(value)) return null;
  return { type: 'decision', value };
}

/**
 * @param {unknown} condition
 * @throws {Error}
 */
export function validateFlowEdgeCondition(condition) {
  if (condition == null) return;
  const normalized = normalizeFlowEdgeCondition(condition);
  if (!normalized) {
    throw new Error('invalid flow edge connection condition');
  }
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeCondition(edge) {
  return normalizeFlowEdgeCondition(edge?.data?.condition);
}

/**
 * @param {{ type: 'decision', value: string } | null | undefined} condition
 */
export function formatFlowConnectionConditionLabel(condition) {
  const normalized = normalizeFlowEdgeCondition(condition);
  if (!normalized) return '';
  return CONDITION_VALUE_LABELS[normalized.value] ?? normalized.value;
}

/**
 * @param {string | null | undefined} typeId
 */
export function suggestFlowConnectionConditionValue(typeId) {
  const normalizedTypeId = normalizeFlowConnectionTypeId(typeId);
  return TYPE_DEFAULT_CONDITION_VALUE[normalizedTypeId] ?? null;
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeConnectionTypeId(edge) {
  return normalizeFlowConnectionTypeId(edge?.data?.connectionTypeId);
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeConnectionTypeCustom(edge) {
  const raw = edge?.data?.connectionTypeCustom;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * True when the edge stores connection type in data (including explicit unspecified).
 * @param {object | null | undefined} edge
 */
export function flowEdgeHasExplicitConnectionType(edge) {
  return edge?.data != null && Object.prototype.hasOwnProperty.call(edge.data, 'connectionTypeId');
}

function appendConditionSuffix(label, condition) {
  const suffix = formatFlowConnectionConditionLabel(condition);
  if (!label) return suffix;
  if (!suffix) return label;
  return `${label} · ${suffix}`;
}

/**
 * Resolved type fields: explicit data wins; otherwise infer from legacy label.
 * @param {object | null | undefined} edge
 */
export function resolveFlowEdgeConnectionTypeFields(edge) {
  if (flowEdgeHasExplicitConnectionType(edge)) {
    const connectionTypeId = flowEdgeConnectionTypeId(edge);
    const type = getFlowConnectionType(connectionTypeId);
    const connectionTypeCustom = type?.allowsCustomText
      ? flowEdgeConnectionTypeCustom(edge)
      : '';
    return {
      connectionTypeId,
      connectionTypeCustom,
      condition: flowEdgeCondition(edge),
    };
  }
  return inferFlowEdgeConnectionTypeState(edge);
}

/**
 * @param {string | null | undefined} typeId
 * @param {string | null | undefined} detail
 * @param {{ type: 'decision', value: string } | null | undefined} [condition]
 */
export function formatFlowConnectionLabel(typeId, detail, condition = null) {
  const id = normalizeFlowConnectionTypeId(typeId);
  const trimmedDetail = typeof detail === 'string' ? detail.trim() : '';
  if (!id) return appendConditionSuffix(trimmedDetail, condition);
  const type = getFlowConnectionType(id);
  if (!type) return appendConditionSuffix(trimmedDetail, condition);
  if (type.allowsCustomText) {
    return appendConditionSuffix(trimmedDetail || 'Custom', condition);
  }
  return appendConditionSuffix(type.label, condition);
}

/**
 * @param {object | null | undefined} edge
 */
export function resolveFlowConnectionLabel(edge) {
  if (!edge) return '';
  if (flowEdgeHasExplicitConnectionType(edge)) {
    const typeId = flowEdgeConnectionTypeId(edge);
    const condition = flowEdgeCondition(edge);
    if (!typeId) return '';
    const type = getFlowConnectionType(typeId);
    if (!type) {
      const legacy = typeof edge.label === 'string' ? edge.label.trim() : '';
      return legacy;
    }
    const detail = type.allowsCustomText ? flowEdgeConnectionTypeCustom(edge) : '';
    return formatFlowConnectionLabel(typeId, detail, condition);
  }
  const inferred = inferFlowEdgeConnectionTypeState(edge);
  if (inferred.connectionTypeId) {
    return formatFlowConnectionLabel(
      inferred.connectionTypeId,
      inferred.connectionTypeCustom,
      inferred.condition,
    );
  }
  const legacy = typeof edge.label === 'string' ? edge.label.trim() : '';
  return legacy;
}

function parseLegacyConnectionLabel(legacyLabel) {
  const colonIndex = legacyLabel.indexOf(':');
  if (colonIndex === -1) {
    const legacyAlias = LEGACY_FLOW_CONNECTION_LABEL_ALIASES[legacyLabel];
    if (legacyAlias) {
      return { connectionTypeId: legacyAlias, connectionTypeCustom: '', condition: null };
    }
    const exactType = FLOW_CONNECTION_TYPE_SCHEMA.types.find(
      (type) => !type.allowsCustomText && type.label === legacyLabel,
    );
    if (exactType) {
      return { connectionTypeId: exactType.id, connectionTypeCustom: '', condition: null };
    }
    return {
      connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
      connectionTypeCustom: legacyLabel,
      condition: null,
    };
  }
  const prefix = legacyLabel.slice(0, colonIndex).trim();
  const detail = legacyLabel.slice(colonIndex + 1).trim();
  const legacyAlias = LEGACY_FLOW_CONNECTION_LABEL_ALIASES[prefix];
  if (legacyAlias) {
    return { connectionTypeId: legacyAlias, connectionTypeCustom: '', condition: null };
  }
  const matchedType = FLOW_CONNECTION_TYPE_SCHEMA.types.find(
    (type) => !type.allowsCustomText && type.label === prefix,
  );
  if (matchedType) {
    return { connectionTypeId: matchedType.id, connectionTypeCustom: '', condition: null };
  }
  return {
    connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
    connectionTypeCustom: legacyLabel,
    condition: null,
  };
}

/**
 * Infer inspector state for edges saved before connection types existed.
 *
 * @param {object | null | undefined} edge
 */
export function inferFlowEdgeConnectionTypeState(edge) {
  const rawTypeId = typeof edge?.data?.connectionTypeId === 'string'
    ? edge.data.connectionTypeId.trim()
    : '';
  if (rawTypeId) {
    const connectionTypeId = normalizeFlowConnectionTypeId(rawTypeId);
    const type = getFlowConnectionType(connectionTypeId);
    return {
      connectionTypeId,
      connectionTypeCustom: type?.allowsCustomText ? flowEdgeConnectionTypeCustom(edge) : '',
      condition: flowEdgeCondition(edge),
    };
  }
  const legacyLabel = typeof edge?.label === 'string' ? edge.label.trim() : '';
  if (legacyLabel) {
    return parseLegacyConnectionLabel(legacyLabel);
  }
  return {
    connectionTypeId: '',
    connectionTypeCustom: '',
    condition: null,
  };
}
