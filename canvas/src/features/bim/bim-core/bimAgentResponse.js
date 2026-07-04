function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

export function labelFromIfcClass(ifcClass, { plural = true } = {}) {
  const raw = String(ifcClass ?? '').replace(/^Ifc/i, '').trim();
  if (!raw) return plural ? 'BIM objects' : 'BIM object';
  const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (!plural) return spaced;
  if (spaced.endsWith('s')) return spaced;
  return `${spaced}s`;
}

export function firstIfcClassFromWhere(where) {
  if (!where || typeof where !== 'object') return null;
  if (where.ifcClass) return asArray(where.ifcClass)[0];
  const nested = [...(where.and ?? []), ...(where.or ?? [])];
  for (const entry of nested) {
    const found = firstIfcClassFromWhere(entry);
    if (found) return found;
  }
  return null;
}

function firstStoreyFromWhere(where) {
  if (!where || typeof where !== 'object') return null;
  if (where.storey) return asArray(where.storey)[0];
  const nested = [...(where.and ?? []), ...(where.or ?? [])];
  for (const entry of nested) {
    const found = firstStoreyFromWhere(entry);
    if (found) return found;
  }
  return null;
}

function firstNameContainsFromWhere(where) {
  if (!where || typeof where !== 'object') return null;
  if (where.nameContains) return asArray(where.nameContains)[0];
  const nested = [...(where.and ?? []), ...(where.or ?? [])];
  for (const entry of nested) {
    const found = firstNameContainsFromWhere(entry);
    if (found) return found;
  }
  return null;
}

function labelFromNameContains(value, { plural = true } = {}) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/tree|plant|vegetation|landscap/.test(raw)) return plural ? 'trees' : 'tree';
  if (!plural) return raw;
  return raw.endsWith('s') ? raw : `${raw}s`;
}

function targetLabel(query) {
  const ifcClass = firstIfcClassFromWhere(query?.where);
  const base = (ifcClass ? labelFromIfcClass(ifcClass) : labelFromNameContains(firstNameContainsFromWhere(query?.where)))
    || 'BIM objects';
  const storey = firstStoreyFromWhere(query?.where);
  return storey ? `${base} on ${storey}` : base;
}

function aggregateSubject(query, aggregate) {
  const ifcClass = firstIfcClassFromWhere(query?.where);
  const singular = (ifcClass ? labelFromIfcClass(ifcClass, { plural: false }) : labelFromNameContains(firstNameContainsFromWhere(query?.where), { plural: false }));
  if (!singular || singular === 'BIM object') return aggregate?.name ?? 'quantity';
  return `${singular} ${aggregate?.name ?? 'quantity'}`;
}

function groupByLabel(groupBy) {
  if (groupBy === 'ifcClass') return 'class';
  if (groupBy === 'typeName' || groupBy === 'type') return 'type';
  if (groupBy === 'storey') return 'storey';
  if (groupBy === 'name') return 'name';
  return String(groupBy ?? 'group');
}

function summarizeGroups(groups = []) {
  const shown = groups.slice(0, 4).map((group) => `${group.value}: ${group.count}`);
  const remaining = groups.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')}; +${remaining} more` : shown.join(', ');
}

export function formatBimAgentAnswer({ query, result }) {
  if (!result) return null;
  const target = targetLabel(query);
  const count = result.objectRefs?.length ?? 0;
  if (result.status === 'empty') return `No ${target} found.`;
  if (result.select === 'groupedCount' || query?.select === 'groupedCount') {
    const groups = result.groups ?? [];
    const breakdown = summarizeGroups(groups);
    const groupLabel = groupByLabel(query?.groupBy);
    return breakdown
      ? `${count} ${target} grouped by ${groupLabel}: ${breakdown}.`
      : `${count} ${target} grouped by ${groupLabel}.`;
  }
  if (result.select === 'aggregate' || query?.select === 'aggregate') {
    const aggregate = result.aggregate;
    if (!aggregate) return result.summary ?? null;
    const value = Number.isFinite(Number(aggregate.value))
      ? Number(aggregate.value).toLocaleString(undefined, { maximumFractionDigits: 3 })
      : '0';
    const unit = aggregate.unit ? ` ${aggregate.unit}` : '';
    const quantityCount = aggregate.matchedValueCount ?? 0;
    const quantityLabel = quantityCount === 1 ? 'IFC quantity value' : 'IFC quantity values';
    return `${value}${unit} total ${aggregateSubject(query, aggregate)} from ${quantityCount} ${quantityLabel}.`;
  }
  if (result.select === 'count' || query?.select === 'count') {
    return `${count} ${target} found.`;
  }
  return result.summary ?? `${count} ${target} found.`;
}

export function summarizeBimAgentEvidence({ query, result }) {
  if (!result) return '';
  const target = targetLabel(query);
  if (result.aggregate) {
    const quantityCount = result.aggregate.matchedValueCount ?? 0;
    return `${quantityCount} IFC quantity ${quantityCount === 1 ? 'value' : 'values'} across ${result.aggregate.objectCount ?? 0} ${target}.`;
  }
  if (result.select === 'groupedCount' || query?.select === 'groupedCount') {
    const groupCount = result.groups?.length ?? 0;
    const objectCount = result.objectRefs?.length ?? 0;
    return `${objectCount} ${target} in ${groupCount} ${groupByLabel(query?.groupBy)} ${groupCount === 1 ? 'group' : 'groups'}.`;
  }
  const objectCount = result.objectRefs?.length ?? 0;
  const evidenceCount = result.evidence?.length ?? 0;
  return `${objectCount} ${target}; ${evidenceCount} evidence ${evidenceCount === 1 ? 'record' : 'records'}.`;
}

export function buildBimAgentResponse({
  question = '',
  selectedResponder = '',
  actualResponder = '',
  status = 'ready',
  workSummary = '',
  warnings = [],
  query = null,
  result = null,
  providerStatus = '',
  providerStatusMessage = '',
  didProviderRun = false,
  fallbackUsed = false,
  semanticResolution = null,
} = {}) {
  return {
    question,
    answer: formatBimAgentAnswer({ query, result }) ?? '',
    selectedResponder,
    actualResponder: actualResponder || selectedResponder,
    status,
    workSummary,
    warnings,
    query,
    result,
    resultSummary: result?.summary ?? '',
    evidenceSummary: summarizeBimAgentEvidence({ query, result }),
    providerStatus,
    providerStatusMessage,
    didProviderRun,
    fallbackUsed,
    semanticResolution,
  };
}
