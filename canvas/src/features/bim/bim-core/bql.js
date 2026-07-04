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

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function textIncludes(value, needle) {
  return String(value ?? '').toLowerCase().includes(String(needle ?? '').toLowerCase());
}

function compareValues(actual, op, expected) {
  if (op === 'exists') return actual !== undefined && actual !== null && actual !== '';
  if (op === 'contains') return textIncludes(actual, expected);
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  const useNumber = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
  const left = useNumber ? actualNumber : String(actual ?? '');
  const right = useNumber ? expectedNumber : String(expected ?? '');
  if (op === '=') return left === right;
  if (op === '!=') return left !== right;
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  if (op === '<') return left < right;
  if (op === '<=') return left <= right;
  return false;
}

function objectProperties(preparedModel, objectRef) {
  if (objectRef.kind !== 'physicalElement') return [];
  return preparedModel.properties?.filter((property) => property.elementId === objectRef.id) ?? [];
}

function propertyPathMatches(property, path) {
  const fullPath = `${property.psetName}.${property.propertyName}`;
  return fullPath === path || property.propertyName === path;
}

function objectMatchesWhere(preparedModel, objectRef, where = {}) {
  if (!where || Object.keys(where).length === 0) return true;
  if (where.and?.some((entry) => !objectMatchesWhere(preparedModel, objectRef, entry))) return false;
  if (where.or && !where.or.some((entry) => objectMatchesWhere(preparedModel, objectRef, entry))) return false;
  if (where.not && objectMatchesWhere(preparedModel, objectRef, where.not)) return false;

  if (where.ifcClass !== undefined) {
    if (objectRef.kind !== 'physicalElement') return false;
    if (!asArray(where.ifcClass).includes(objectRef.ifcClass)) return false;
  }
  if (where.semanticType !== undefined) {
    if (objectRef.kind !== 'semanticAssembly') return false;
    if (!asArray(where.semanticType).includes(objectRef.kindName)) return false;
  }
  if (where.storey !== undefined) {
    if (objectRef.kind !== 'physicalElement') return false;
    if (!asArray(where.storey).some((storey) => textIncludes(objectRef.storeyId, storey))) return false;
  }
  if (where.nameContains !== undefined) {
    if (!textIncludes(objectRef.name, where.nameContains) && !textIncludes(objectRef.typeName, where.nameContains)) return false;
  }

  const properties = objectProperties(preparedModel, objectRef);
  if (where.properties?.some((predicate) => {
    const matches = properties.filter((property) => propertyPathMatches(property, predicate.path));
    if (predicate.op === 'exists') return matches.length === 0;
    return !matches.some((property) => compareValues(property.value, predicate.op, predicate.value));
  })) return false;

  if (where.quantities?.some((predicate) => {
    const matches = properties.filter((property) => property.source === 'ifc-quantity' && property.propertyName === predicate.name);
    if (predicate.op === 'exists') return matches.length === 0;
    return !matches.some((property) => compareValues(property.value, predicate.op, predicate.value));
  })) return false;

  return true;
}

function physicalRefs(preparedModel) {
  return (preparedModel.elements ?? []).map((element) => ({
    ...element,
    kind: 'physicalElement',
    kindName: element.ifcClass,
  }));
}

function assemblyRefs(preparedModel) {
  return (preparedModel.semanticAssemblies ?? []).map((assembly) => ({
    id: assembly.id,
    modelId: assembly.modelId,
    kind: 'semanticAssembly',
    kindName: assembly.kind,
    name: assembly.label ?? assembly.id,
    typeName: assembly.kind,
    storeyId: null,
    assembly,
  }));
}

function rowsForRefs(refs) {
  return refs.map((ref) => ({
    id: ref.id,
    kind: ref.kind,
    name: ref.name ?? ref.id,
    ifcClass: ref.ifcClass ?? ref.kindName,
    ifcGlobalId: ref.ifcGlobalId ?? null,
    storeyId: ref.storeyId ?? null,
    typeName: ref.typeName ?? ref.kindName ?? null,
  }));
}

function evidenceForRefs(preparedModel, refs) {
  const provenance = preparedModel.provenance ?? [];
  return refs.flatMap((ref) => {
    const base = [{
      objectId: ref.id,
      evidenceType: ref.kind === 'semanticAssembly' ? 'semanticAssembly' : 'ifcClass',
      value: ref.kindName,
      ifcGlobalId: ref.ifcGlobalId,
    }];
    const records = provenance
      .filter((record) => record.recordId === ref.id)
      .map((record) => ({
        objectId: ref.id,
        evidenceType: 'relationship',
        value: record.extractionRule,
        ifcGlobalId: record.ifcGlobalId,
      }));
    return [...base, ...records];
  });
}

export function executeBqlQuery(preparedModel, query) {
  const validation = validateBqlQuery(query);
  if (!validation.ok) {
    return {
      queryId: `bql:${Date.now()}`,
      status: 'error',
      objectRefs: [],
      tableRows: [],
      viewerState: { mode: query?.view?.mode ?? 'highlight', focus: false },
      evidence: [],
      summary: 'Invalid BQL query',
      warnings: validation.errors.map((error) => `${error.path}: ${error.message}`),
    };
  }

  const from = query.from ?? (query.select === 'assemblies' ? 'semanticAssemblies' : 'physicalElements');
  const candidates = [
    ...(from === 'semanticAssemblies' ? [] : physicalRefs(preparedModel)),
    ...(from === 'physicalElements' ? [] : assemblyRefs(preparedModel)),
  ];
  const matched = candidates
    .filter((ref) => objectMatchesWhere(preparedModel, ref, query.where))
    .slice(0, query.limit ?? candidates.length);

  const objectRefs = matched.map((ref) => ({
    id: ref.id,
    kind: ref.kind,
    ifcGlobalId: ref.ifcGlobalId,
    fragmentsObjectId: ref.fragmentsObjectId ?? ref.ifcGlobalId,
  }));
  const status = matched.length > 0 ? 'success' : 'empty';
  const countOnly = query.select === 'count';

  return {
    queryId: `bql:${Date.now()}`,
    status,
    objectRefs,
    tableRows: countOnly ? [] : rowsForRefs(matched),
    viewerState: {
      mode: query.view?.mode ?? 'highlight',
      focus: Boolean(query.view?.focus),
      objectIds: objectRefs.map((ref) => ref.id),
    },
    evidence: evidenceForRefs(preparedModel, matched),
    summary: countOnly
      ? `${matched.length} matching BIM objects`
      : `${matched.length} matching BIM ${matched.length === 1 ? 'object' : 'objects'}`,
    warnings: [],
  };
}
