export const FLOW_CONNECTION_CUSTOM_TYPE_ID = 'custom';

export const FLOW_CONNECTION_TYPE_SCHEMA = Object.freeze({
  version: 1,
  types: Object.freeze([
    Object.freeze({
      id: 'driven_by',
      label: 'Driven by',
      description: 'Target is driven or triggered by the source.',
    }),
    Object.freeze({
      id: 'output_type',
      label: 'Output type',
      description: 'Describes what kind of output flows across this link.',
    }),
    Object.freeze({
      id: 'depends_on',
      label: 'Depends on',
      description: 'Target depends on the source.',
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
export function getFlowConnectionType(id) {
  const key = typeof id === 'string' ? id.trim() : '';
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
  const key = typeof id === 'string' ? id.trim() : '';
  return key === '' || TYPE_BY_ID.has(key);
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeConnectionTypeId(edge) {
  const raw = edge?.data?.connectionTypeId;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * @param {object | null | undefined} edge
 */
export function flowEdgeConnectionTypeCustom(edge) {
  const raw = edge?.data?.connectionTypeCustom;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * @param {string | null | undefined} typeId
 * @param {string | null | undefined} detail
 */
export function formatFlowConnectionLabel(typeId, detail) {
  const id = typeof typeId === 'string' ? typeId.trim() : '';
  const trimmedDetail = typeof detail === 'string' ? detail.trim() : '';
  if (!id) return trimmedDetail;
  const type = getFlowConnectionType(id);
  if (!type) return trimmedDetail;
  if (type.allowsCustomText) {
    return trimmedDetail || 'Custom';
  }
  return trimmedDetail ? `${type.label}: ${trimmedDetail}` : type.label;
}

/**
 * @param {object | null | undefined} edge
 */
export function resolveFlowConnectionLabel(edge) {
  if (!edge) return '';
  const typeId = flowEdgeConnectionTypeId(edge);
  if (!typeId) {
    const legacy = typeof edge.label === 'string' ? edge.label.trim() : '';
    return legacy;
  }
  const type = getFlowConnectionType(typeId);
  if (!type) {
    const legacy = typeof edge.label === 'string' ? edge.label.trim() : '';
    return legacy;
  }
  return formatFlowConnectionLabel(typeId, flowEdgeConnectionTypeCustom(edge));
}

function parseLegacyConnectionLabel(legacyLabel) {
  const colonIndex = legacyLabel.indexOf(':');
  if (colonIndex === -1) {
    const exactType = FLOW_CONNECTION_TYPE_SCHEMA.types.find(
      (type) => !type.allowsCustomText && type.label === legacyLabel,
    );
    if (exactType) {
      return { connectionTypeId: exactType.id, connectionTypeCustom: '' };
    }
    return {
      connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
      connectionTypeCustom: legacyLabel,
    };
  }
  const prefix = legacyLabel.slice(0, colonIndex).trim();
  const detail = legacyLabel.slice(colonIndex + 1).trim();
  const matchedType = FLOW_CONNECTION_TYPE_SCHEMA.types.find(
    (type) => !type.allowsCustomText && type.label === prefix,
  );
  if (matchedType) {
    return { connectionTypeId: matchedType.id, connectionTypeCustom: detail };
  }
  return {
    connectionTypeId: FLOW_CONNECTION_CUSTOM_TYPE_ID,
    connectionTypeCustom: legacyLabel,
  };
}

/**
 * Infer inspector state for edges saved before connection types existed.
 *
 * @param {object | null | undefined} edge
 */
export function inferFlowEdgeConnectionTypeState(edge) {
  const typeId = flowEdgeConnectionTypeId(edge);
  if (typeId) {
    return {
      connectionTypeId: typeId,
      connectionTypeCustom: flowEdgeConnectionTypeCustom(edge),
    };
  }
  const legacyLabel = typeof edge?.label === 'string' ? edge.label.trim() : '';
  if (legacyLabel) {
    return parseLegacyConnectionLabel(legacyLabel);
  }
  return {
    connectionTypeId: '',
    connectionTypeCustom: '',
  };
}
