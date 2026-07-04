const TOP_LEVEL_FIELDS = new Set(['version', 'select', 'from', 'where', 'include', 'view', 'limit']);
const SELECT_VALUES = new Set(['elements', 'assemblies', 'count', 'properties']);
const FROM_VALUES = new Set(['physicalElements', 'semanticAssemblies', 'allBimObjects']);
const WHERE_FIELDS = new Set(['ifcClass', 'semanticType', 'storey', 'nameContains', 'properties', 'quantities', 'and', 'or', 'not']);
const PROPERTY_OPS = new Set(['=', '!=', '>', '>=', '<', '<=', 'contains', 'exists']);
const VIEW_MODES = new Set(['highlight', 'isolate', 'ghostOthers', 'colorBy']);

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateWhere(where, errors, path = 'where') {
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    addError(errors, path, 'where must be an object');
    return;
  }
  Object.keys(where).forEach((field) => {
    if (!WHERE_FIELDS.has(field)) addError(errors, `${path}.${field}`, 'Unsupported where field');
  });
  for (const key of ['and', 'or']) {
    if (where[key] !== undefined) {
      if (!Array.isArray(where[key])) {
        addError(errors, `${path}.${key}`, `${key} must be an array`);
      } else {
        where[key].forEach((entry, index) => validateWhere(entry, errors, `${path}.${key}[${index}]`));
      }
    }
  }
  if (where.not !== undefined) validateWhere(where.not, errors, `${path}.not`);
  for (const key of ['properties', 'quantities']) {
    if (where[key] === undefined) continue;
    if (!Array.isArray(where[key])) {
      addError(errors, `${path}.${key}`, `${key} must be an array`);
      continue;
    }
    where[key].forEach((predicate, index) => {
      if (!predicate || typeof predicate !== 'object') {
        addError(errors, `${path}.${key}[${index}]`, 'Predicate must be an object');
        return;
      }
      if (!PROPERTY_OPS.has(predicate.op)) {
        addError(errors, `${path}.${key}[${index}].op`, 'Unsupported operator');
      }
    });
  }
}

export function validateBqlQuery(query) {
  const errors = [];
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return { ok: false, errors: [{ path: 'query', message: 'BQL query must be an object' }] };
  }
  Object.keys(query).forEach((field) => {
    if (!TOP_LEVEL_FIELDS.has(field)) addError(errors, field, 'Unsupported top-level field');
  });
  if (query.version !== '0.1') addError(errors, 'version', 'BQL version must be 0.1');
  if (!SELECT_VALUES.has(query.select)) addError(errors, 'select', 'Unsupported select value');
  if (query.from !== undefined && !FROM_VALUES.has(query.from)) addError(errors, 'from', 'Unsupported from value');
  if (query.where !== undefined) validateWhere(query.where, errors);
  if (query.view !== undefined) {
    if (!query.view || typeof query.view !== 'object' || !VIEW_MODES.has(query.view.mode)) {
      addError(errors, 'view.mode', 'Unsupported view mode');
    }
  }
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1)) {
    addError(errors, 'limit', 'limit must be a positive integer');
  }
  return { ok: errors.length === 0, errors };
}
