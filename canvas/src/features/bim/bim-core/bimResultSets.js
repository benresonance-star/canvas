export const BIM_RESULT_SET_LIMIT = 40;
export const BIM_RESULT_SET_ELEMENT_LIMIT = 10000;

function uniqueStrings(values, limit = BIM_RESULT_SET_ELEMENT_LIMIT) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, limit);
}

function safeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function safeColor(value, fallback = '#f59e0b') {
  const color = String(value ?? fallback);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeBimResultSet(entry, index = 0) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const elementIds = uniqueStrings(entry.elementIds);
  const assemblyIds = uniqueStrings(entry.assemblyIds);
  if (elementIds.length === 0 && assemblyIds.length === 0) return null;
  const createdAt = safeIsoDate(entry.createdAt, new Date(0).toISOString());
  return {
    id: String(entry.id ?? `result-set-${index}`),
    name: String(entry.name ?? entry.label ?? `Result set ${index + 1}`).slice(0, 80),
    createdAt,
    updatedAt: safeIsoDate(entry.updatedAt, createdAt),
    elementIds,
    assemblyIds,
    sourceQuery: entry.sourceQuery && typeof entry.sourceQuery === 'object' ? entry.sourceQuery : null,
    color: safeColor(entry.color),
    notes: String(entry.notes ?? '').slice(0, 1000),
  };
}

export function normalizeBimResultSets(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry, index) => normalizeBimResultSet(entry, index))
    .filter(Boolean)
    .slice(0, BIM_RESULT_SET_LIMIT);
}

export function createBimResultSetFromElements({
  name = 'Saved result set',
  elementIds = [],
  assemblyIds = [],
  sourceQuery = null,
  color = '#f59e0b',
  notes = '',
  now = new Date().toISOString(),
} = {}) {
  return normalizeBimResultSet({
    id: `bim-result-set:${now}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    elementIds,
    assemblyIds,
    sourceQuery,
    color,
    notes,
  });
}

function resolveAssemblyElementIds(assemblyIds = [], assemblyMembers = []) {
  const wanted = new Set(uniqueStrings(assemblyIds, 1000));
  if (wanted.size === 0) return [];
  return uniqueStrings(
    assemblyMembers
      .filter((member) => wanted.has(String(member?.assemblyId ?? '')))
      .map((member) => member?.elementId),
  );
}

export function resolveResultSetElementIds(resultSetIds = [], resultSets = [], assemblyMembers = []) {
  const wanted = new Set(uniqueStrings(resultSetIds, 1000));
  if (wanted.size === 0) return [];
  return uniqueStrings(
    resultSets
      .filter((resultSet) => wanted.has(resultSet.id))
      .flatMap((resultSet) => [
        ...(resultSet.elementIds ?? []),
        ...resolveAssemblyElementIds(resultSet.assemblyIds ?? [], assemblyMembers),
      ]),
  );
}

export function resolveBimAssemblyElementIds(assemblyIds = [], assemblyMembers = []) {
  return resolveAssemblyElementIds(assemblyIds, assemblyMembers);
}
